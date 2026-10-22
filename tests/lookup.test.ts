import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fieldsFrom, type LookupResult } from '../src/lib/lookup';
import { parsePage } from '../src/lib/wikitext';

const result = (name: string, patch: Partial<LookupResult> = {}): LookupResult => ({
  query: name,
  title: name,
  entries: parsePage(readFileSync(new URL(`./fixtures/${name}.wiki`, import.meta.url), 'utf8')).entries,
  baseFrom: null,
  machine: { en: '', ru: '' },
  articleHint: null,
  reflexive: false,
  ...patch,
});

describe('fieldsFrom', () => {
  it('keeps the article from the entry', () => {
    const f = fieldsFrom(result('Bank', { articleHint: 'die' }));
    expect(f.article).toBe('die');
    expect(f.word).toBe('Bank');
    expect(f.ru).toBe('скамейка, скамья, лавка');
  });

  it('keeps "sich" for reflexive verbs', () => {
    expect(fieldsFrom(result('freuen', { reflexive: true })).word).toBe('sich freuen');
  });

  it('falls back to machine translation only when Wiktionary has none', () => {
    const f = fieldsFrom(result('Fernweh', { machine: { en: 'x', ru: 'y' } }));
    expect(f.en).toBe('wanderlust, itchy feet');
  });
});
