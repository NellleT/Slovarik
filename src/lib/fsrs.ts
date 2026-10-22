// FSRS-5 scheduler with Anki-style learning steps.
// Formulas follow the reference implementation (open-spaced-repetition/fsrs-rs)
// with its default parameters.

import type { Rating, Srs } from './types';

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11,
  0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;

export const MINUTE = 60_000;
export const DAY = 86_400_000;
const LEARN_STEPS = [1 * MINUTE, 10 * MINUTE];
const RELEARN_STEPS = [10 * MINUTE];
const MAX_INTERVAL = 36500;

export function newSrs(now: number): Srs {
  return { state: 'new', due: now, stability: 0, difficulty: 0, step: 0, reps: 0, lapses: 0, last: null };
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const initStability = (g: Rating) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g: Rating) => W[4] - Math.exp(W[5] * (g - 1)) + 1;

function nextDifficulty(d: number, g: Rating): number {
  const damped = d + (-W[6] * (g - 3) * (10 - d)) / 9;
  return clampD(W[7] * initDifficulty(4) + (1 - W[7]) * damped);
}

export function retrievability(elapsedDays: number, s: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / s, DECAY);
}

function recallStability(d: number, s: number, r: number, g: Rating): number {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
}

function forgetStability(d: number, s: number, r: number): number {
  const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
  return Math.max(0.01, Math.min(f, s));
}

const shortTermStability = (s: number, g: Rating) => Math.max(0.01, s * Math.exp(W[17] * (g - 3 + W[18])));

function interval(s: number, retention: number): number {
  const days = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(days)));
}

function hardDelay(steps: number[], step: number): number {
  if (step === 0) return steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5;
  return steps[step];
}

/** Spreads reviews so cards added together don't stay glued together. */
function fuzz(days: number, seed: number): number {
  if (days < 3) return days;
  const spread = Math.max(1, Math.round(days * (days < 7 ? 0.15 : days < 20 ? 0.1 : 0.05)));
  const rnd = (Math.sin(seed) * 10000) % 1;
  return Math.max(1, days + Math.round(Math.abs(rnd) * 2 * spread - spread));
}

function toReview(s: Srs, days: number, now: number, seed: number): Srs {
  s.state = 'review';
  s.step = 0;
  s.due = now + fuzz(days, seed) * DAY;
  return s;
}

export function schedule(prev: Srs, g: Rating, now: number, retention: number, seed: number): Srs {
  const s: Srs = { ...prev, reps: prev.reps + 1, last: now };

  if (prev.state === 'new') {
    s.stability = initStability(g);
    s.difficulty = clampD(initDifficulty(g));
    if (g === 4 || (g === 3 && LEARN_STEPS.length < 2)) return toReview(s, interval(s.stability, retention), now, seed);
    s.state = 'learning';
    s.step = g === 3 ? 1 : 0;
    s.due = now + (g === 1 ? LEARN_STEPS[0] : g === 2 ? hardDelay(LEARN_STEPS, 0) : LEARN_STEPS[1]);
    return s;
  }

  if (prev.state === 'learning' || prev.state === 'relearning') {
    const steps = prev.state === 'learning' ? LEARN_STEPS : RELEARN_STEPS;
    s.difficulty = nextDifficulty(prev.difficulty, g);
    s.stability = shortTermStability(prev.stability, g);
    if (g === 1) {
      s.step = 0;
      s.due = now + steps[0];
      return s;
    }
    if (g === 2) {
      s.due = now + hardDelay(steps, prev.step);
      return s;
    }
    if (g === 3 && prev.step + 1 < steps.length) {
      s.step = prev.step + 1;
      s.due = now + steps[s.step];
      return s;
    }
    const good = interval(shortTermStability(prev.stability, 3), retention);
    const days = g === 4 ? Math.max(interval(s.stability, retention), good + 1) : good;
    return toReview(s, days, now, seed);
  }

  // review
  const elapsed = Math.max(0, (now - (prev.last ?? now)) / DAY);
  const r = retrievability(elapsed, prev.stability);
  s.difficulty = nextDifficulty(prev.difficulty, g);
  if (g === 1) {
    s.stability = forgetStability(prev.difficulty, prev.stability, r);
    s.lapses = prev.lapses + 1;
    s.state = 'relearning';
    s.step = 0;
    s.due = now + RELEARN_STEPS[0];
    return s;
  }
  const sHard = recallStability(prev.difficulty, prev.stability, r, 2);
  const sGood = recallStability(prev.difficulty, prev.stability, r, 3);
  const sEasy = recallStability(prev.difficulty, prev.stability, r, 4);
  const iHard = Math.min(interval(sHard, retention), interval(sGood, retention));
  const iGood = Math.max(interval(sGood, retention), iHard + 1);
  const iEasy = Math.max(interval(sEasy, retention), iGood + 1);
  s.stability = g === 2 ? sHard : g === 3 ? sGood : sEasy;
  return toReview(s, g === 2 ? iHard : g === 3 ? iGood : iEasy, now, seed);
}

/** Delay in ms each answer would produce, for the button labels. */
export function preview(prev: Srs, now: number, retention: number, seed: number): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const g of [1, 2, 3, 4] as Rating[]) out[g] = schedule(prev, g, now, retention, seed).due - now;
  return out;
}

export function seedFor(id: string, dir: string, reps: number): number {
  let h = reps + 1;
  for (const ch of id + dir) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
