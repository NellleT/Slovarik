// Parser for German Wiktionary (de.wiktionary.org) wikitext.
// Only the parts Slovarik needs: part of speech, gender, forms,
// meanings, an example and EN/RU translations.

export type Article = 'der' | 'die' | 'das';

export interface Sense {
  text: string;
  example: string;
  en: string[];
  ru: string[];
}

export interface Entry {
  word: string;
  pos: string;
  article: Article | null;
  /** true for plural-only nouns like "Leute" */
  pluralOnly: boolean;
  forms: string;
  ipa: string;
  senses: Sense[];
}

export interface ParsedPage {
  entries: Entry[];
  /** base form for inflected pages ("Häuser" -> "Haus") */
  baseForms: string[];
}

const INFLECTED = new Set([
  'Deklinierte Form',
  'Konjugierte Form',
  'Komparativ',
  'Superlativ',
  'Partizip I',
  'Partizip II',
  'Erweiterter Infinitiv',
]);

const POS_ALIASES: Record<string, string> = {
  Substantiv: 'Substantiv',
  Verb: 'Verb',
  Adjektiv: 'Adjektiv',
  Adverb: 'Adverb',
  Pronomen: 'Pronomen',
  Präposition: 'Präposition',
  Konjunktion: 'Konjunktion',
  Subjunktion: 'Konjunktion',
  Interjektion: 'Interjektion',
  Numerale: 'Numerale',
  Partikel: 'Partikel',
  Redewendung: 'Redewendung',
};

export function parsePage(text: string): ParsedPage {
  const german = germanSection(text);
  if (!german) return { entries: [], baseForms: [] };

  const entries: Entry[] = [];
  const baseForms: string[] = [];

  for (const block of splitEntries(german)) {
    const posList = [...block.heading.matchAll(/\{\{Wortart\|([^|}]+)\|Deutsch\}\}/g)].map((m) => m[1].trim());
    if (posList.length === 0) continue;

    if (posList.every((p) => INFLECTED.has(p))) {
      for (const m of block.body.matchAll(/\{\{Grundformverweis[^|}]*\|([^|}]+)/g)) {
        const base = m[1].trim();
        if (base && !baseForms.includes(base)) baseForms.push(base);
      }
      continue;
    }

    entries.push(parseEntry(block.title, block.heading, block.body, posList));
  }

  return { entries, baseForms };
}

function germanSection(text: string): { title: string; body: string } | null {
  const lines = text.split('\n');
  let start = -1;
  let title = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^==\s*(.+?)\s*\(\{\{Sprache\|Deutsch\}\}\)\s*==\s*$/);
    if (m) {
      start = i + 1;
      title = m[1];
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^==[^=]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { title, body: lines.slice(start, end).join('\n') };
}

function splitEntries(section: { title: string; body: string }) {
  const out: { title: string; heading: string; body: string }[] = [];
  const lines = section.body.split('\n');
  let cur: { title: string; heading: string; lines: string[] } | null = null;
  for (const line of lines) {
    if (/^===[^=]/.test(line)) {
      if (cur) out.push({ title: cur.title, heading: cur.heading, body: cur.lines.join('\n') });
      cur = { title: section.title, heading: line, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) out.push({ title: cur.title, heading: cur.heading, body: cur.lines.join('\n') });
  return out;
}

function parseEntry(title: string, heading: string, body: string, posList: string[]): Entry {
  const pos = POS_ALIASES[posList[0]] ?? posList[0];
  const overview = parseOverview(body);
  const sections = parseSections(body);

  let article: Article | null = null;
  let pluralOnly = false;
  if (pos === 'Substantiv') {
    const genus = overview['Genus'] ?? overview['Genus 1'] ?? genderFromHeading(heading);
    if (genus === 'm') article = 'der';
    else if (genus === 'f') article = 'die';
    else if (genus === 'n') article = 'das';
    else if (genus === '0' || genus === 'pl') {
      article = 'die';
      pluralOnly = true;
    }
  }

  const examples = numbered(sections['Beispiele'] ?? [])
    .map((e) => ({ n: e.n, quoted: isQuote(e.text), text: cleanExample(e.text) }))
    .filter((e) => e.text.length > 0 && e.text.length <= 160);
  // Prefer the made-up textbook-like sentences over long quotes.
  examples.sort((a, b) => Number(a.quoted) - Number(b.quoted) || a.text.length - b.text.length);

  const translations = parseTranslations(body);
  const forSense = (list: { n: number; word: string }[], n: number) => {
    const out: string[] = [];
    for (const t of list) if (t.n === n && !out.includes(t.word) && out.length < 4) out.push(t.word);
    return out;
  };

  const senses: Sense[] = [];
  const seen = new Set<string>();
  for (const m of numbered(sections['Bedeutungen'] ?? [])) {
    // Sub-senses ([1a], [1b]) share the number of their parent.
    if (seen.has(m.n)) continue;
    const text = shorten(cleanInline(m.text));
    if (!text) continue;
    seen.add(m.n);
    const n = Number(m.n);
    senses.push({
      text,
      example: examples.find((e) => e.n === m.n)?.text ?? '',
      en: forSense(translations.en, n),
      ru: forSense(translations.ru, n),
    });
  }

  return {
    word: title,
    pos,
    article,
    pluralOnly,
    forms: buildForms(pos, overview, pluralOnly),
    ipa: parseIpa(sections['Aussprache'] ?? []),
    senses,
  };
}

/** Wiktionary definitions can run for a paragraph; keep the first clause. */
function shorten(text: string): string {
  if (text.length <= 150) return text;
  const cut = text.indexOf(';');
  if (cut > 20) return text.slice(0, cut).trim();
  return text;
}

function genderFromHeading(heading: string): string | undefined {
  const m = heading.match(/\{\{(m|f|n)\}\}/);
  return m?.[1];
}

function parseOverview(body: string): Record<string, string> {
  const start = body.search(/\{\{Deutsch [^|}\n]*Übersicht/);
  if (start < 0) return {};
  const out: Record<string, string> = {};
  const lines = body.slice(start).split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('}}')) break;
    const m = line.match(/^\|([^=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function buildForms(pos: string, o: Record<string, string>, pluralOnly: boolean): string {
  const v = (k: string) => {
    const s = o[k];
    return s && s !== '—' && s !== '-' ? cleanInline(s) : '';
  };
  if (pos === 'Substantiv') {
    if (pluralOnly) return 'nur Plural';
    const gen = v('Genitiv Singular') || v('Genitiv Singular 1');
    const pl = v('Nominativ Plural') || v('Nominativ Plural 1');
    const genus = o['Genus'] ?? o['Genus 1'];
    const parts: string[] = [];
    // Feminine genitive equals the nominative, so it only adds noise.
    if (gen && genus !== 'f') parts.push(`Gen. des ${gen}`);
    parts.push(pl ? `Pl. die ${pl}` : 'nur Singular');
    return parts.join(' · ');
  }
  if (pos === 'Verb') {
    const er = v('Präsens_er, sie, es');
    const prät = v('Präteritum_ich');
    const p2 = v('Partizip II');
    const aux = v('Hilfsverb') || 'haben';
    const auxForm = aux.startsWith('sein') ? 'ist' : 'hat';
    const parts = [er, prät, p2 ? `${auxForm} ${p2}` : ''].filter(Boolean);
    return parts.join(' · ');
  }
  if (pos === 'Adjektiv') {
    const komp = v('Komparativ');
    const sup = v('Superlativ');
    const parts = [komp, sup ? `am ${sup}` : ''].filter(Boolean);
    return parts.join(' · ');
  }
  return '';
}

/** Splits an entry body into "{{Name}}" sections. */
function parseSections(body: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let cur: string[] | null = null;
  for (const line of body.split('\n')) {
    const header = line.match(/^\{\{([^|{}]+)\}\}\s*$/);
    if (header) {
      cur = out[header[1].trim()] = [];
      continue;
    }
    if (/^=+/.test(line)) {
      cur = null;
      continue;
    }
    if (cur) cur.push(line);
  }
  return out;
}

function numbered(lines: string[]): { n: string; text: string }[] {
  const out: { n: string; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^:\[(\d+)[a-z]?\]\s*(.*)$/);
    if (m) out.push({ n: m[1], text: m[2] });
  }
  return out;
}

function parseIpa(lines: string[]): string {
  for (const line of lines) {
    const m = line.match(/\{\{IPA\}\}\s*\{\{Lautschrift\|([^}]+)\}\}/);
    if (m) return m[1];
  }
  return '';
}

interface Translations {
  en: { n: number; word: string }[];
  ru: { n: number; word: string }[];
}

function parseTranslations(body: string): Translations {
  const out: Translations = { en: [], ru: [] };
  const lines = body.split('\n');
  let tableN = 0;
  for (const line of lines) {
    const t = line.match(/^\{\{Ü-Tabelle(?:\|(\d+))?/);
    if (t) {
      tableN = t[1] ? Number(t[1]) : 0;
      continue;
    }
    const l = line.match(/^\*\{\{(en|ru)\}\}:\s*(.*)$/);
    if (!l) continue;
    const lang = l[1] as 'en' | 'ru';
    // Old table layout keeps the meaning numbers inline: "[1] {{Ü|en|x}}; [2] ..."
    let n = tableN || 1;
    const re = /\[(\d+)[^\]]*\]|\{\{Ü(?:t|xx4|xx5)?\|[a-z-]+\|([^{}]*)\}\}/g;
    for (const m of l[2].matchAll(re)) {
      if (m[1]) {
        n = Number(m[1]);
        continue;
      }
      const word = translationWord(m[0], m[2]);
      if (word) out[lang].push({ n, word });
    }
  }
  return out;
}

function translationWord(full: string, params: string): string {
  const parts = params.split('|');
  const positional = parts.filter((p) => !p.includes('='));
  const named = Object.fromEntries(
    parts.filter((p) => p.includes('=')).map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]),
  );
  let word: string;
  if (full.startsWith('{{Üxx5')) word = positional[2] || positional[0] || '';
  else if (full.startsWith('{{Üxx4')) word = named['v'] || positional[0] || '';
  else word = positional[0] || '';
  return cleanInline(word).trim();
}

const CONTEXT_LABELS: Record<string, string> = {
  'ugs.': 'umgangssprachlich',
  'va.': 'veraltend',
  'veraltet': 'veraltet',
  'übertr.': 'übertragen',
  'österr.': 'österreichisch',
  'schweiz.': 'schweizerisch',
  'südd.': 'süddeutsch',
  'norddt.': 'norddeutsch',
  'reg.': 'regional',
  'geh.': 'gehoben',
  'fachspr.': 'fachsprachlich',
  'trans.': 'transitiv',
  'intrans.': 'intransitiv',
  'refl.': 'reflexiv',
  'scherzh.': 'scherzhaft',
  'abw.': 'abwertend',
  'Pl.': 'Plural',
  'Sg.': 'Singular',
};

/** Turns a line of wikitext into plain readable text. */
export function cleanInline(s: string, keepEmphasis = false): string {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  t = t.replace(/<sup>[\s\S]*?<\/sup>/g, '');
  t = t.replace(/<\/?[a-z][^>]*>/gi, '');
  // {{K|ugs.|scherzhaft}} -> "umgangssprachlich, scherzhaft:"
  t = t.replace(/\{\{K\|([^{}]*)\}\}/g, (_, inner: string) => {
    const labels = inner
      .split('|')
      .filter((p) => !p.includes('='))
      .map((p) => CONTEXT_LABELS[p.trim()] ?? p.trim())
      .filter(Boolean);
    return labels.length ? `${labels.join(', ')}: ` : '';
  });
  // Nested templates: resolve the innermost ones first.
  for (let i = 0; i < 4 && /\{\{[^{}]*\}\}/.test(t); i++) {
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => {
      const parts = inner.split('|');
      const name = parts[0].trim();
      if (CONTEXT_LABELS[name]) return CONTEXT_LABELS[name];
      if (/^(Ü|Üt|L|Lit|Ref|Per|Wikipedia|Literatur|Internetquelle)/.test(name) && parts.length > 1) {
        return name.startsWith('Ü') ? parts[2] ?? '' : '';
      }
      if (parts.length === 1 && name.length < 16) return name;
      return '';
    });
  }
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]]*)\]\]/g, '$1');
  t = t.replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, '$1');
  if (keepEmphasis) t = t.replace(/''([^']+?)''/g, '*$1*');
  t = t.replace(/'''?/g, '');
  t = t.replace(/&nbsp;/g, ' ');
  t = t.replace(/\s+([,.;:!?])/g, '$1');
  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/:\s*:/g, ':');
  return t.trim();
}

function cleanExample(s: string): string {
  let t = cleanInline(s, true);
  t = t.replace(/^[„"»]|[“"«]$/g, '');
  return t.trim();
}

/** Citations from books/newspapers are quoted and carry a <ref>. */
function isQuote(s: string): boolean {
  return /<ref|^\s*[„"»]/.test(s);
}
