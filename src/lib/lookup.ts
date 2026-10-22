import { parsePage, type Article, type Entry } from './wikitext';
import { t } from './i18n';
import type { CardFields } from './types';

const WIKI_API = 'https://de.wiktionary.org/w/api.php';
const MT_API = 'https://api.mymemory.translated.net/get';
const USER_AGENT = 'Slovarik/0.1 (desktop flashcards; personal use)';

export interface LookupResult {
  /** what the user typed, minus the article */
  query: string;
  /** Wiktionary title the entries came from */
  title: string | null;
  entries: Entry[];
  /** set when the typed word was an inflected form */
  baseFrom: string | null;
  /** machine translation for languages Wiktionary had nothing for */
  machine: { en: string; ru: string };
  articleHint: Article | null;
  reflexive: boolean;
}

export class LookupError extends Error {}

const cache = new Map<string, Promise<LookupResult>>();

export function lookup(input: string): Promise<LookupResult> {
  const key = input.trim().replace(/\s+/g, ' ');
  let p = cache.get(key);
  if (!p) {
    p = doLookup(key);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function doLookup(input: string): Promise<LookupResult> {
  let word = input;
  let articleHint: Article | null = null;
  let reflexive = false;

  const art = word.match(/^(der|die|das)\s+(.+)$/i);
  if (art) {
    articleHint = art[1].toLowerCase() as Article;
    word = art[2];
  }
  const refl = word.match(/^sich\s+(.+)$/i);
  if (refl) {
    reflexive = true;
    word = refl[1];
  }

  const result: LookupResult = {
    query: word,
    title: null,
    entries: [],
    baseFrom: null,
    machine: { en: '', ru: '' },
    articleHint,
    reflexive,
  };

  let page = await fetchWiktionary(candidates(word, articleHint !== null));
  if (page && page.entries.length === 0 && page.baseForms.length > 0) {
    const base = page.baseForms[0];
    const basePage = await fetchWiktionary([base]);
    if (basePage && basePage.entries.length > 0) {
      result.baseFrom = word;
      page = basePage;
    }
  }

  if (page && page.entries.length > 0) {
    result.title = page.title;
    result.entries = page.entries;
    // Prefer the entry matching the article the user typed ("die Bank" vs "der Bank").
    if (articleHint) {
      const i = page.entries.findIndex((e) => e.article === articleHint);
      if (i > 0) result.entries = [page.entries[i], ...page.entries.filter((_, j) => j !== i)];
    }
  }

  const first = result.entries[0]?.senses[0];
  const lemma = result.title ?? word;
  const [en, ru] = await Promise.all([
    first?.en.length ? '' : machineTranslate(lemma, 'en'),
    first?.ru.length ? '' : machineTranslate(lemma, 'ru'),
  ]);
  result.machine = { en, ru };

  if (result.entries.length === 0 && !en && !ru) {
    throw new LookupError('not-found');
  }
  return result;
}

function candidates(word: string, isNoun: boolean): string[] {
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  const low = word.charAt(0).toLowerCase() + word.slice(1);
  const list = isNoun ? [cap, word, low] : [word, cap, low];
  return [...new Set(list)];
}

async function fetchWiktionary(titles: string[]) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    titles: titles.join('|'),
    redirects: '1',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const data = await getJson(`${WIKI_API}?${params}`);
  const pages: { title: string; missing?: boolean; revisions?: { slots: { main: { content: string } } }[] }[] =
    data?.query?.pages ?? [];
  const redirects: { from: string; to: string }[] = data?.query?.redirects ?? [];
  const normalized: { from: string; to: string }[] = data?.query?.normalized ?? [];

  const resolve = (t: string) => {
    let x = normalized.find((n) => n.from === t)?.to ?? t;
    x = redirects.find((r) => r.from === x)?.to ?? x;
    return x;
  };

  let fallback: { title: string; entries: Entry[]; baseForms: string[] } | null = null;
  for (const t of titles) {
    const page = pages.find((p) => p.title === resolve(t));
    const content = page?.revisions?.[0]?.slots.main.content;
    if (!page || page.missing || !content) continue;
    const parsed = parsePage(content);
    if (parsed.entries.length > 0) return { title: page.title, ...parsed };
    if (!fallback && parsed.baseForms.length > 0) fallback = { title: page.title, ...parsed };
  }
  return fallback;
}

async function machineTranslate(word: string, to: 'en' | 'ru'): Promise<string> {
  try {
    const params = new URLSearchParams({ q: word, langpair: `de|${to}` });
    const data = await getJson(`${MT_API}?${params}`);
    const text: string = data?.responseData?.translatedText ?? '';
    if (!text || /MYMEMORY WARNING|INVALID/i.test(text)) return '';
    // MyMemory echoes the input when it has nothing.
    if (text.trim().toLowerCase() === word.toLowerCase()) return '';
    return text.trim();
  } catch {
    return '';
  }
}

async function getJson(url: string, attempt = 0): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: url.startsWith(WIKI_API) ? { 'Api-User-Agent': USER_AGENT } : undefined,
    });
    const text = await res.text();
    if (res.status === 429 || /too many requests/i.test(text.slice(0, 200))) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        return getJson(url, attempt + 1);
      }
      throw new LookupError('rate-limited');
    }
    if (!res.ok) throw new LookupError(`http-${res.status}`);
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof LookupError) throw e;
    throw new LookupError('network');
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Builds editable card fields from a lookup result. */
export function fieldsFrom(result: LookupResult, entryIndex = 0, senseIndex = 0): CardFields {
  const entry = result.entries[entryIndex];
  const sense = entry?.senses[senseIndex];
  const join = (xs: string[] | undefined) => (xs ?? []).join(', ');
  let word = entry?.word ?? result.query;
  if (result.reflexive && entry?.pos === 'Verb') word = `sich ${word}`;
  return {
    word,
    article: entry?.article ?? result.articleHint,
    pos: entry?.pos ?? '',
    forms: entry?.forms ?? '',
    ipa: entry?.ipa ?? '',
    definition: sense?.text ?? '',
    en: join(sense?.en) || (senseIndex === 0 ? result.machine.en : ''),
    ru: join(sense?.ru) || (senseIndex === 0 ? result.machine.ru : ''),
    example: sense?.example ?? '',
    note: '',
  };
}

export function lookupErrorText(e: unknown): string {
  const code = e instanceof LookupError ? e.message : 'network';
  const L = t().lookupErrors;
  if (code === 'not-found') return L.notFound;
  if (code === 'rate-limited') return L.rateLimited;
  return L.network;
}
