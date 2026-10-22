// Merging two copies of the dictionary (this device and the synced gist).
// Nothing is ever dropped silently: cards are united by id, each half of a
// card (its text, its review state) comes from the side that changed it last,
// deletions win only over cards that weren't edited after them.

import type { Card, Db, ReviewLog } from './types';

const srsStamp = (c: Card) => c.srsAt ?? Math.max(c.srs.fwd.last ?? 0, c.srs.rev?.last ?? 0, c.created);
const reps = (c: Card) => c.srs.fwd.reps + (c.srs.rev?.reps ?? 0);

function mergeCard(a: Card, b: Card): Card {
  const text = b.updated > a.updated ? b : a;
  const sa = srsStamp(a);
  const sb = srsStamp(b);
  const review = sb > sa || (sb === sa && reps(b) > reps(a)) ? b : a;
  return {
    ...text,
    created: Math.min(a.created, b.created),
    updated: Math.max(a.updated, b.updated),
    srs: review.srs,
    srsAt: Math.max(sa, sb),
  };
}

const logKey = (l: ReviewLog) => `${l[0]}:${l[1]}:${l[2]}`;

export function mergeDb(local: Db, remote: Db): Db {
  const deleted: Record<string, number> = { ...remote.deleted };
  for (const [id, t] of Object.entries(local.deleted)) deleted[id] = Math.max(t, deleted[id] ?? 0);

  const remoteById = new Map(remote.cards.map((c) => [c.id, c]));
  const localIds = new Set(local.cards.map((c) => c.id));
  const merged: Card[] = [];
  for (const c of local.cards) {
    const other = remoteById.get(c.id);
    merged.push(other ? mergeCard(c, other) : c);
  }
  const onlyRemote = remote.cards.filter((c) => !localIds.has(c.id)).sort((a, b) => a.created - b.created);
  const cards = [...merged, ...onlyRemote]
    .filter((c) => !(deleted[c.id] >= c.updated))
    .map((c) => (c.srsAt === undefined ? { ...c, srsAt: srsStamp(c) } : c));

  const seen = new Set<string>();
  const log: ReviewLog[] = [];
  for (const l of [...local.log, ...remote.log]) {
    const k = logKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    log.push(l);
  }
  log.sort((a, b) => a[0] - b[0]);

  const settingsFromRemote = remote.settingsAt > local.settingsAt;
  return {
    version: 1,
    cards,
    log,
    settings: settingsFromRemote ? remote.settings : local.settings,
    settingsAt: Math.max(local.settingsAt, remote.settingsAt),
    deleted,
  };
}

/** Order-independent form, to tell whether two copies hold the same data. */
export function canonical(db: Db): string {
  const cards = [...db.cards].sort((a, b) => (a.id < b.id ? -1 : 1));
  const log = [...db.log].sort((a, b) => a[0] - b[0] || (logKey(a) < logKey(b) ? -1 : 1));
  const deleted = Object.fromEntries(Object.entries(db.deleted).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({ cards, log, deleted, settings: db.settings, settingsAt: db.settingsAt });
}
