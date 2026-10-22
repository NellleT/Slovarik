import { useSyncExternalStore } from 'react';
import { newSrs, schedule, seedFor } from './fsrs';
import { setLanguage } from './i18n';
import { repairMojibake } from './mojibake';
import type { QueueItem } from './queue';
import { loadRaw, saveRaw } from './storage';
import {
  DEFAULT_SETTINGS,
  STATE_INDEX,
  type Card,
  type CardFields,
  type Db,
  type Direction,
  type Rating,
  type Settings,
} from './types';

let db: Db = { version: 1, cards: [], log: [], settings: { ...DEFAULT_SETTINGS }, settingsAt: 0, deleted: {} };
const listeners = new Set<() => void>();
const changeListeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function commit(next: Db, fromSync = false) {
  db = next;
  setLanguage(db.settings.lang);
  emit();
  saveRaw(JSON.stringify(db));
  if (!fromSync) for (const l of changeListeners) l();
}

/** Called after every change made on this device (not the ones that came from sync). */
export function onLocalChange(l: () => void) {
  changeListeners.add(l);
  return () => changeListeners.delete(l);
}

/** Replaces the database with a merged copy from sync. */
export function applySynced(next: Db) {
  commit(next, true);
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, () => db);
}

export const getDb = () => db;

export async function initStore(): Promise<void> {
  const raw = await loadRaw();
  if (raw) db = normalizeDb(JSON.parse(raw));
  setLanguage(db.settings.lang);
  emit();
}

export function normalizeDb(x: any): Db {
  const deleted: Record<string, number> = {};
  for (const [id, t] of Object.entries(x?.deleted ?? {})) if (Number(t)) deleted[id] = Number(t);
  return {
    version: 1,
    cards: Array.isArray(x?.cards) ? x.cards.map((c: any) => normalizeCard(c)) : [],
    log: Array.isArray(x?.log) ? x.log.filter((l: unknown) => Array.isArray(l) && l.length >= 5) : [],
    settings: { ...DEFAULT_SETTINGS, ...(x?.settings ?? {}) },
    settingsAt: Number(x?.settingsAt) || 0,
    deleted,
  };
}

const EMPTY_FIELDS: CardFields = {
  word: '',
  article: null,
  pos: '',
  forms: '',
  ipa: '',
  definition: '',
  en: '',
  ru: '',
  example: '',
  note: '',
};

function normalizeCard(c: any, now = Date.now()): Card {
  const fields = { ...EMPTY_FIELDS };
  for (const k of Object.keys(EMPTY_FIELDS) as (keyof CardFields)[]) {
    if (k === 'article') fields.article = c?.article === 'der' || c?.article === 'die' || c?.article === 'das' ? c.article : null;
    else if (typeof c?.[k] === 'string') fields[k] = k === 'en' || k === 'ru' ? repairMojibake(c[k]) : c[k];
  }
  const created = Number(c?.created) || now;
  const srs = c?.srs?.fwd ? c.srs : { fwd: newSrs(now) };
  return {
    ...fields,
    id: typeof c?.id === 'string' ? c.id : makeId(),
    created,
    updated: Number(c?.updated) || now,
    srs,
    srsAt: Number(c?.srsAt) || Math.max(srs.fwd.last ?? 0, srs.rev?.last ?? 0, created),
  };
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const normWord = (w: string) =>
  w
    .trim()
    .toLowerCase()
    .replace(/^(der|die|das|sich)\s+/, '');

export function findDuplicate(word: string, exceptId?: string): Card | undefined {
  const w = normWord(word);
  if (!w) return undefined;
  return db.cards.find((c) => c.id !== exceptId && normWord(c.word) === w);
}

export function addCard(fields: CardFields): Card {
  const now = Date.now();
  const card: Card = { ...trimFields(fields), id: makeId(), created: now, updated: now, srs: { fwd: newSrs(now) }, srsAt: now };
  commit({ ...db, cards: [...db.cards, card] });
  return card;
}

export function addCards(list: CardFields[]): number {
  const now = Date.now();
  const cards = list.map((f, i) => ({
    ...trimFields(f),
    id: makeId() + i,
    created: now + i,
    updated: now + i,
    srs: { fwd: newSrs(now + i) },
    srsAt: now + i,
  }));
  commit({ ...db, cards: [...db.cards, ...cards] });
  return cards.length;
}

function trimFields(f: CardFields): CardFields {
  const out = { ...f };
  for (const k of Object.keys(out) as (keyof CardFields)[]) {
    const v = out[k];
    if (typeof v === 'string') (out as any)[k] = v.trim();
  }
  return out;
}

export function updateCard(id: string, fields: Partial<CardFields>) {
  commit({
    ...db,
    cards: db.cards.map((c) => (c.id === id ? { ...c, ...trimFields({ ...c, ...fields }), updated: Date.now() } : c)),
  });
}

export function deleteCard(id: string): Card | undefined {
  const card = db.cards.find((c) => c.id === id);
  commit({ ...db, cards: db.cards.filter((c) => c.id !== id), deleted: { ...db.deleted, [id]: Date.now() } });
  return card;
}

export function restoreCard(card: Card) {
  if (db.cards.some((c) => c.id === card.id)) return;
  // A newer edit time than the deletion keeps the card alive on other devices too.
  const cards = [...db.cards, { ...card, updated: Date.now() }].sort((a, b) => a.created - b.created);
  const { [card.id]: _, ...deleted } = db.deleted;
  commit({ ...db, cards, deleted });
}

export function resetCard(id: string) {
  const now = Date.now();
  commit({ ...db, cards: db.cards.map((c) => (c.id === id ? { ...c, srs: { fwd: newSrs(now) }, srsAt: now } : c)) });
}

interface UndoEntry {
  card: Card;
  dir: Direction;
  /** time of the log entry the answer added */
  at: number;
}
const undoStack: UndoEntry[] = [];

export function answer(item: QueueItem, rating: Rating, msSpent: number) {
  const now = Date.now();
  const card = db.cards.find((c) => c.id === item.card.id);
  if (!card) return;
  const prev = item.srs;
  const next = schedule(prev, rating, now, db.settings.retention, seedFor(card.id, item.dir, prev.reps));
  const updated: Card = { ...card, srs: { ...card.srs, [item.dir]: next }, srsAt: now };
  undoStack.push({ card, dir: item.dir, at: now });
  if (undoStack.length > 20) undoStack.shift();
  commit({
    ...db,
    cards: db.cards.map((c) => (c.id === card.id ? updated : c)),
    log: [...db.log, [now, card.id, item.dir === 'fwd' ? 0 : 1, rating, STATE_INDEX[prev.state], Math.min(msSpent, 120000)]],
  });
}

export const canUndo = () => undoStack.length > 0;

/** Reverts the last answer and returns the card/direction to show again. */
export function undoAnswer(): { id: string; dir: Direction } | null {
  const u = undoStack.pop();
  if (!u) return null;
  commit({
    ...db,
    cards: db.cards.map((c) => (c.id === u.card.id ? { ...c, srs: u.card.srs, srsAt: Date.now() } : c)),
    log: db.log.filter((l) => !(l[0] === u.at && l[1] === u.card.id)),
  });
  return { id: u.card.id, dir: u.dir };
}

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...db, settings: { ...db.settings, ...patch }, settingsAt: Date.now() });
}

export function exportJson(): string {
  return JSON.stringify(db, null, 1);
}

/** Merges a Slovarik backup into the current database; words that already exist are skipped. */
export function importJson(text: string): { added: number; skipped: number } {
  const data = JSON.parse(text);
  const incoming: any[] = Array.isArray(data) ? data : Array.isArray(data?.cards) ? data.cards : [];
  const ids = new Set(db.cards.map((c) => c.id));
  const words = new Set(db.cards.map((c) => normWord(c.word)));
  let added = 0;
  let skipped = 0;
  const cards = [...db.cards];
  for (const raw of incoming) {
    const card = normalizeCard(raw);
    const w = normWord(card.word);
    if (!w || ids.has(card.id) || words.has(w)) {
      skipped++;
      continue;
    }
    cards.push(card);
    ids.add(card.id);
    words.add(w);
    added++;
  }
  const log = Array.isArray(data?.log) ? mergeLogs(db.log, data.log) : db.log;
  commit({ ...db, cards, log });
  return { added, skipped };
}

function mergeLogs(a: Db['log'], b: Db['log']): Db['log'] {
  const seen = new Set(a.map((l) => `${l[0]}:${l[1]}`));
  return [...a, ...b.filter((l) => Array.isArray(l) && !seen.has(`${l[0]}:${l[1]}`))].sort((x, y) => x[0] - y[0]);
}
