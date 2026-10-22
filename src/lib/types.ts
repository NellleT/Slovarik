import type { LangPref } from './i18n';
import type { Article } from './wikitext';

export type { Article };

export interface CardFields {
  word: string;
  article: Article | null;
  pos: string;
  forms: string;
  ipa: string;
  /** German explanation */
  definition: string;
  en: string;
  ru: string;
  /** example sentence; *word* marks emphasis */
  example: string;
  note: string;
}

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface Srs {
  state: CardState;
  due: number;
  stability: number;
  difficulty: number;
  /** index into the (re)learning steps */
  step: number;
  reps: number;
  lapses: number;
  last: number | null;
}

/** fwd: German → translation, rev: translation → German */
export type Direction = 'fwd' | 'rev';

export interface Card extends CardFields {
  id: string;
  created: number;
  /** last edit of the text fields */
  updated: number;
  srs: { fwd: Srs; rev?: Srs };
  /** last change of the review state (answer, undo, reset); decides which device wins on sync */
  srsAt?: number;
}

export type Rating = 1 | 2 | 3 | 4;

/** [time, cardId, 0 = fwd | 1 = rev, rating, state before (0 new … 3 relearning), ms spent] */
export type ReviewLog = [number, string, 0 | 1, Rating, 0 | 1 | 2 | 3, number];

export interface Settings {
  newPerDay: number;
  maxReviews: number;
  retention: number;
  reverse: boolean;
  hideArticle: boolean;
  autoSpeak: boolean;
  theme: 'system' | 'light' | 'dark';
  lang: LangPref;
}

export interface Db {
  version: 1;
  cards: Card[];
  log: ReviewLog[];
  settings: Settings;
  settingsAt: number;
  /** card id -> when it was deleted, so sync doesn't bring it back */
  deleted: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 15,
  maxReviews: 200,
  retention: 0.9,
  reverse: false,
  hideArticle: false,
  autoSpeak: false,
  theme: 'system',
  lang: 'auto',
};

export const STATE_INDEX: Record<CardState, 0 | 1 | 2 | 3> = {
  new: 0,
  learning: 1,
  review: 2,
  relearning: 3,
};
