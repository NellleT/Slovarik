import { DAY, MINUTE, newSrs } from './fsrs';
import type { Card, Db, Direction, Srs } from './types';

export interface QueueItem {
  card: Card;
  dir: Direction;
  srs: Srs;
}

export const itemKey = (i: { card: Card; dir: Direction }) => `${i.card.id}:${i.dir}`;

/** The study day rolls over at 4:00, like in Anki. */
export function dayStart(now: number): number {
  const d = new Date(now);
  d.setHours(4, 0, 0, 0);
  if (now < d.getTime()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function doneToday(db: Db, now: number) {
  const start = dayStart(now);
  let fresh = 0;
  let reviews = 0;
  let total = 0;
  let ms = 0;
  for (let i = db.log.length - 1; i >= 0; i--) {
    const [t, , , , before, spent] = db.log[i];
    if (t < start) break;
    total++;
    ms += spent;
    if (before === 0) fresh++;
    else if (before === 2) reviews++;
  }
  return { fresh, reviews, total, ms };
}

export function allItems(db: Db): QueueItem[] {
  const out: QueueItem[] = [];
  for (const card of db.cards) {
    out.push({ card, dir: 'fwd', srs: card.srs.fwd });
    // Reverse cards appear once the forward card has graduated.
    if (db.settings.reverse && card.srs.fwd.state !== 'new' && card.srs.fwd.state !== 'learning') {
      out.push({ card, dir: 'rev', srs: card.srs.rev ?? newSrs(card.created) });
    }
  }
  return out;
}

export interface Queue {
  learning: QueueItem[];
  review: QueueItem[];
  fresh: QueueItem[];
  newLeft: number;
  reviewLeft: number;
}

export function buildQueue(db: Db, now: number): Queue {
  const end = dayStart(now) + DAY;
  const learning: QueueItem[] = [];
  const review: QueueItem[] = [];
  const fresh: QueueItem[] = [];
  for (const item of allItems(db)) {
    const st = item.srs.state;
    if (st === 'learning' || st === 'relearning') learning.push(item);
    else if (st === 'review' && item.srs.due < end) review.push(item);
    else if (st === 'new') fresh.push(item);
  }
  learning.sort((a, b) => a.srs.due - b.srs.due);
  review.sort((a, b) => a.srs.due - b.srs.due);
  fresh.sort((a, b) => a.card.created - b.card.created || (a.dir === 'fwd' ? -1 : 1));

  const done = doneToday(db, now);
  const newLeft = Math.max(0, db.settings.newPerDay - done.fresh);
  const reviewLeft = Math.max(0, db.settings.maxReviews - done.reviews);
  return { learning, review, fresh, newLeft, reviewLeft };
}

export interface Counts {
  fresh: number;
  learning: number;
  review: number;
}

export function counts(q: Queue, now: number): Counts {
  return {
    fresh: Math.min(q.fresh.length, q.newLeft),
    learning: q.learning.filter((i) => i.srs.due < now + 20 * MINUTE).length,
    review: Math.min(q.review.length, q.reviewLeft),
  };
}

export interface NextResult {
  item: QueueItem | null;
  counts: Counts;
  /** when the next learning card becomes due, if any are waiting */
  waitUntil: number | null;
}

export function nextItem(db: Db, now: number, lastKey: string | null): NextResult {
  const q = buildQueue(db, now);
  const c = counts(q, now);
  const notLast = (list: QueueItem[]) => list.find((i) => itemKey(i) !== lastKey) ?? list[0];

  const dueLearning = q.learning.filter((i) => i.srs.due <= now);
  const reviews = q.review.slice(0, q.reviewLeft);
  const fresh = q.fresh.slice(0, q.newLeft);

  let item: QueueItem | undefined;
  if (dueLearning.length) item = notLast(dueLearning);
  if (!item || (itemKey(item) === lastKey && (reviews.length || fresh.length))) {
    // Mix new words in between reviews instead of saving them for the end.
    const done = doneToday(db, now).total;
    const wantNew = fresh.length > 0 && (reviews.length === 0 || done % 4 === 3);
    item = wantNew ? notLast(fresh) : reviews.length ? notLast(reviews) : item;
  }
  if (!item) {
    // Nothing else to do: pull learning cards forward a bit.
    const ahead = q.learning.filter((i) => i.srs.due <= now + 20 * MINUTE);
    if (ahead.length) item = ahead[0];
  }

  const waitUntil = !item && q.learning.length ? q.learning[0].srs.due : null;
  return { item: item ?? null, counts: c, waitUntil };
}

/** How many cards will be due on each of the next `days` days. */
export function forecast(db: Db, now: number, days: number): number[] {
  const start = dayStart(now);
  const out = new Array(days).fill(0);
  for (const { srs } of allItems(db)) {
    if (srs.state === 'new') continue;
    const d = Math.max(0, Math.floor((srs.due - start) / DAY));
    if (d < days) out[d]++;
  }
  return out;
}
