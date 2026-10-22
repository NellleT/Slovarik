import { DAY, MINUTE } from './fsrs';
import { t } from './i18n';
import { dayStart } from './queue';

const decimal = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', t().decimal);

/** Short interval label for answer buttons: "10 мин", "4 d", "1,5 Mon." */
export function formatDelay(ms: number): string {
  const u = t().units;
  if (ms < MINUTE) return u.underMinute;
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)} ${u.min}`;
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))} ${u.hour}`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)} ${u.day}`;
  if (days < 365) return `${decimal(days / 30)} ${u.month}`;
  return `${decimal(days / 365)} ${u.year}`;
}

/** When a card is due, relative to today: "today", "tomorrow", "in 5 d". */
export function formatDue(due: number, now: number): string {
  const u = t().units;
  const today = dayStart(now);
  if (due < today + DAY) return u.today;
  if (due < today + 2 * DAY) return u.tomorrow;
  return u.inTime(formatDelay(dayStart(due) - today));
}

export function formatDuration(ms: number): string {
  const u = t().units;
  const min = Math.round(ms / MINUTE);
  if (min < 1) return u.lessThanMinute;
  if (min < 60) return u.minutes(min);
  return u.hoursMinutes(Math.floor(min / 60), min % 60);
}

/** Splits "Das *Haus* ist groß" into plain and emphasized parts. */
export function emphasisParts(text: string): { text: string; em: boolean }[] {
  const out: { text: string; em: boolean }[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), em: false });
    out.push({ text: m[1], em: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), em: false });
  return out;
}
