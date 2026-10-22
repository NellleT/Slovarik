import { describe, expect, it } from 'vitest';
import { newSrs, schedule } from '../src/lib/fsrs';
import { canonical, mergeDb } from '../src/lib/merge';
import { DEFAULT_SETTINGS, type Card, type Db } from '../src/lib/types';

const T = new Date('2026-03-02T10:00:00').getTime();

function card(id: string, patch: Partial<Card> = {}): Card {
  return {
    id,
    word: id,
    article: null,
    pos: '',
    forms: '',
    ipa: '',
    definition: '',
    en: '',
    ru: '',
    example: '',
    note: '',
    created: T,
    updated: T,
    srs: { fwd: newSrs(T) },
    ...patch,
  };
}

const db = (cards: Card[], patch: Partial<Db> = {}): Db => ({
  version: 1,
  cards,
  log: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsAt: 0,
  deleted: {},
  ...patch,
});

describe('mergeDb', () => {
  it('keeps words added on either device', () => {
    const m = mergeDb(db([card('a')]), db([card('b')]));
    expect(m.cards.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('takes the text and the review state from whichever side changed them last', () => {
    // Device A edited the translation, device B reviewed the card.
    const edited = card('x', { ru: 'новый перевод', updated: T + 1000 });
    const reviewed = card('x', { srs: { fwd: schedule(newSrs(T), 3, T + 500, 0.9, 1) }, srsAt: T + 500 });
    for (const [l, r] of [
      [edited, reviewed],
      [reviewed, edited],
    ]) {
      const [c] = mergeDb(db([l]), db([r])).cards;
      expect(c.ru).toBe('новый перевод');
      expect(c.srs.fwd.state).toBe('learning');
    }
  });

  it('lets a progress reset win over an older review', () => {
    const reviewed = card('x', { srs: { fwd: schedule(newSrs(T), 4, T + 10, 0.9, 1) }, srsAt: T + 10 });
    const reset = card('x', { srs: { fwd: newSrs(T + 20) }, srsAt: T + 20 });
    expect(mergeDb(db([reviewed]), db([reset])).cards[0].srs.fwd.state).toBe('new');
  });

  it('does not bring deleted words back', () => {
    const m = mergeDb(db([], { deleted: { a: T + 5 } }), db([card('a')]));
    expect(m.cards).toHaveLength(0);
    expect(m.deleted.a).toBe(T + 5);
  });

  it('keeps a word that was edited after it was deleted elsewhere', () => {
    const m = mergeDb(db([], { deleted: { a: T + 5 } }), db([card('a', { updated: T + 9 })]));
    expect(m.cards).toHaveLength(1);
  });

  it('unites review history without duplicates', () => {
    const l = db([], { log: [[T, 'a', 0, 3, 0, 1000]] });
    const r = db([], { log: [[T, 'a', 0, 3, 0, 1000], [T + 1, 'b', 0, 1, 2, 900]] });
    expect(mergeDb(l, r).log).toHaveLength(2);
  });

  it('takes the newer settings', () => {
    const l = db([], { settings: { ...DEFAULT_SETTINGS, newPerDay: 5 }, settingsAt: T });
    const r = db([], { settings: { ...DEFAULT_SETTINGS, newPerDay: 30 }, settingsAt: T + 1 });
    expect(mergeDb(l, r).settings.newPerDay).toBe(30);
    expect(mergeDb(r, l).settings.newPerDay).toBe(30);
  });

  it('is stable: merging twice changes nothing', () => {
    const a = db([card('a'), card('b', { updated: T + 3 })], { deleted: { z: T } });
    const b = db([card('b'), card('c')], { log: [[T, 'c', 0, 3, 0, 10]] });
    const once = mergeDb(a, b);
    expect(canonical(mergeDb(once, b))).toBe(canonical(once));
    expect(canonical(mergeDb(b, once))).toBe(canonical(once));
  });
});
