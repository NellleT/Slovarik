import type { Card, CardFields } from './types';

const COLUMNS: (keyof CardFields)[] = ['article', 'word', 'pos', 'forms', 'definition', 'en', 'ru', 'example', 'note'];

const escape = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(cards: Card[]): string {
  const rows = [COLUMNS.join(',')];
  for (const c of cards) rows.push(COLUMNS.map((k) => escape(String(c[k] ?? ''))).join(','));
  // BOM so Excel opens Cyrillic and umlauts correctly.
  return '﻿' + rows.join('\n');
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') >>> 0);
  const sep = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Reads a CSV exported by Slovarik (or anything with a header row using the same column names). */
export function cardsFromCsv(text: string): CardFields[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('word');
  const index = (k: string) => (hasHeader ? header.indexOf(k) : COLUMNS.indexOf(k as keyof CardFields));
  const out: CardFields[] = [];
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const get = (k: keyof CardFields) => {
      const i = index(k);
      return i >= 0 ? (r[i] ?? '').trim() : '';
    };
    const article = get('article');
    const word = get('word');
    if (!word) continue;
    out.push({
      word,
      article: article === 'der' || article === 'die' || article === 'das' ? article : null,
      pos: get('pos'),
      forms: get('forms'),
      ipa: '',
      definition: get('definition'),
      en: get('en'),
      ru: get('ru'),
      example: get('example'),
      note: get('note'),
    });
  }
  return out;
}
