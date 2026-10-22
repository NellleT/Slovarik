import { describe, expect, it } from 'vitest';
import { DAY, MINUTE, newSrs, schedule } from '../src/lib/fsrs';
import { dayStart, itemKey, nextItem } from '../src/lib/queue';
import { DEFAULT_SETTINGS, type Card, type Db } from '../src/lib/types';

const NOW = new Date('2026-03-02T10:00:00').getTime();

function card(id: string, created: number): Card {
  return {
    id,
    created,
    updated: created,
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
    srs: { fwd: newSrs(created) },
  };
}

const db = (cards: Card[], patch: Partial<Db['settings']> = {}): Db => ({
  version: 1,
  cards,
  log: [],
  settings: { ...DEFAULT_SETTINGS, ...patch },
});

describe('queue', () => {
  it('rolls the day over at 4:00', () => {
    const night = new Date('2026-03-02T02:00:00').getTime();
    expect(new Date(dayStart(night)).getDate()).toBe(1);
    expect(new Date(dayStart(NOW)).getHours()).toBe(4);
  });

  it('respects the daily new card limit', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`c${i}`, NOW - 1000 + i));
    const r = nextItem(db(cards, { newPerDay: 5 }), NOW, null);
    expect(r.counts.fresh).toBe(5);
    expect(r.item?.card.id).toBe('c0');
  });

  it('shows due learning cards first and waits for future ones', () => {
    const a = card('a', NOW - 5000);
    a.srs.fwd = schedule(a.srs.fwd, 3, NOW - 11 * MINUTE, 0.9, 1);
    const b = card('b', NOW - 4000);
    expect(nextItem(db([b, a]), NOW, null).item?.card.id).toBe('a');

    const c = card('c', NOW);
    c.srs.fwd = schedule(c.srs.fwd, 3, NOW, 0.9, 1); // due in 10 min
    const r = nextItem(db([c], { newPerDay: 0 }), NOW - 30 * MINUTE + 10 * MINUTE, null);
    expect(r.item).toBeNull();
    expect(r.waitUntil).toBe(c.srs.fwd.due);
  });

  it('adds reverse cards only after the forward card graduated', () => {
    const a = card('a', NOW - 10 * DAY);
    const reverse = db([a], { reverse: true });
    expect(nextItem(reverse, NOW, null).counts.fresh).toBe(1);
    a.srs.fwd = { ...a.srs.fwd, state: 'review', due: NOW + 3 * DAY, stability: 3, difficulty: 5, last: NOW };
    const r = nextItem(db([a], { reverse: true }), NOW, null);
    expect(r.item && itemKey(r.item)).toBe('a:rev');
  });
});
