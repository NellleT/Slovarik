import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanInline, parsePage } from '../src/lib/wikitext';

const page = (name: string) => parsePage(readFileSync(new URL(`./fixtures/${name}.wiki`, import.meta.url), 'utf8'));

describe('parsePage', () => {
  it('reads a noun with gender, forms and translations', () => {
    const [e] = page('Fernweh').entries;
    expect(e.word).toBe('Fernweh');
    expect(e.article).toBe('das');
    expect(e.forms).toBe('Gen. des Fernwehs · nur Singular');
    expect(e.senses[0].text).toBe('Sehnsucht nach der Ferne, nach fernen Ländern');
    expect(e.senses[0].en).toContain('wanderlust');
    expect(e.senses[0].ru[0]).toBe('охота к перемене мест');
    expect(e.senses[0].example).toMatch(/\*Fernweh\*/);
  });

  it('keeps homonyms as separate entries', () => {
    const entries = page('Bank').entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].forms).toBe('Pl. die Bänke');
    expect(entries[1].forms).toContain('Banken');
    expect(entries[1].senses[0].ru).toEqual(['банк']);
  });

  it('points inflected forms to the base form', () => {
    const p = page('Häuser');
    expect(p.entries).toHaveLength(0);
    expect(p.baseForms).toEqual(['Haus']);
  });

  it('handles plural-only nouns', () => {
    const [e] = page('Leute').entries;
    expect(e.article).toBe('die');
    expect(e.pluralOnly).toBe(true);
    expect(e.forms).toBe('nur Plural');
  });

  it('builds verb and adjective forms', () => {
    expect(page('freuen').entries[0].forms).toBe('freut · freute · hat gefreut');
    expect(page('schnell').entries[0].forms).toBe('schneller · am schnellsten');
  });
});

describe('cleanInline', () => {
  it('strips links, refs and context templates', () => {
    expect(cleanInline('{{K|ugs.|scherzhaft}} [[Mensch]], [[Person|Personen]]<ref>{{Ref-Duden}}</ref>')).toBe(
      'umgangssprachlich, scherzhaft: Mensch, Personen',
    );
  });
  it('can keep emphasis for examples', () => {
    expect(cleanInline("Das ''Haus'' ist groß.", true)).toBe('Das *Haus* ist groß.');
  });
});
