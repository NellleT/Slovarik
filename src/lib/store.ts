import { useSyncExternalStore } from 'react';
import { newSrs, schedule, seedFor } from './fsrs';
import { setLanguage } from './i18n';
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

let db: Db = { version: 1, cards: [], log: [], settings: { ...DEFAULT_SETTINGS } };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function commit(next: Db) {
  db = next;
  setLanguage(db.settings.lang);
  emit();
  saveRaw(JSON.stringify(db));
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

function normalizeDb(x: any): Db {
  return {
    version: 1,
    cards: Array.isArray(x?.cards) ? x.cards.map((c: any) => normalizeCard(c)) : [],
    log: Array.isArray(x?.log) ? x.log : [],
    settings: { ...DEFAULT_SETTINGS, ...(x?.settings ?? {}) },
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
    else if (typeof c?.[k] === 'string') fields[k] = c[k];
  }
  return {
    ...fields,
    id: typeof c?.id === 'string' ? c.id : makeId(),
    created: Number(c?.created) || now,
    updated: Number(c?.updated) || now,
    srs: c?.srs?.fwd ? c.srs : { fwd: newSrs(now) },
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
  const card: Card = { ...trimFields(fields), id: makeId(), created: now, updated: now, srs: { fwd: newSrs(now) } };
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
  commit({ ...db, cards: db.cards.filter((c) => c.id !== id) });
  return card;
}

export function restoreCard(card: Card) {
  if (db.cards.some((c) => c.id === card.id)) return;
  const cards = [...db.cards, card].sort((a, b) => a.created - b.created);
  commit({ ...db, cards });
}

export function resetCard(id: string) {
  const now = Date.now();
  commit({ ...db, cards: db.cards.map((c) => (c.id === id ? { ...c, srs: { fwd: newSrs(now) } } : c)) });
}

interface UndoEntry {
  card: Card;
  dir: Direction;
  logLength: number;
}
const undoStack: UndoEntry[] = [];

export function answer(item: QueueItem, rating: Rating, msSpent: number) {
  const now = Date.now();
  const card = db.cards.find((c) => c.id === item.card.id);
  if (!card) return;
  const prev = item.srs;
  const next = schedule(prev, rating, now, db.settings.retention, seedFor(card.id, item.dir, prev.reps));
  const updated: Card = { ...card, srs: { ...card.srs, [item.dir]: next } };
  undoStack.push({ card, dir: item.dir, logLength: db.log.length });
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
    cards: db.cards.map((c) => (c.id === u.card.id ? { ...c, srs: u.card.srs } : c)),
    log: db.log.slice(0, u.logLength),
  });
  return { id: u.card.id, dir: u.dir };
}

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...db, settings: { ...db.settings, ...patch } });
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
