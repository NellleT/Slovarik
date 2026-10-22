import { describe, expect, it } from 'vitest';
import { DAY, MINUTE, newSrs, preview, retrievability, schedule } from '../src/lib/fsrs';
import { formatDelay } from '../src/lib/format';
import { setLanguage, t } from '../src/lib/i18n';

const NOW = new Date('2026-03-02T10:00:00').getTime();

describe('fsrs', () => {
  it('runs new cards through the learning steps', () => {
    const p = preview(newSrs(NOW), NOW, 0.9, 1);
    expect(p[1]).toBe(1 * MINUTE);
    expect(p[2]).toBe(5.5 * MINUTE);
    expect(p[3]).toBe(10 * MINUTE);
    expect(p[4]).toBeGreaterThanOrEqual(14 * DAY);
  });

  it('graduates after the last step', () => {
    const a = schedule(newSrs(NOW), 3, NOW, 0.9, 1);
    expect(a.state).toBe('learning');
    const b = schedule(a, 3, NOW + 10 * MINUTE, 0.9, 1);
    expect(b.state).toBe('review');
    const days = (b.due - b.last!) / DAY;
    expect(days).toBeGreaterThanOrEqual(3);
    expect(days).toBeLessThanOrEqual(6);
  });

  it('keeps answer buttons ordered for review cards', () => {
    let s = schedule(newSrs(NOW), 3, NOW, 0.9, 1);
    s = schedule(s, 3, NOW + 10 * MINUTE, 0.9, 1);
    const at = s.due;
    const p = preview(s, at, 0.9, 7);
    expect(p[1]).toBe(10 * MINUTE);
    expect(p[2]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
    const lapse = schedule(s, 1, at, 0.9, 7);
    expect(lapse.state).toBe('relearning');
    expect(lapse.lapses).toBe(1);
    expect(lapse.stability).toBeLessThan(s.stability);
  });

  it('defines stability as the 90% recall point', () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
  });

  it('asks for more frequent reviews at higher retention', () => {
    let s = schedule(newSrs(NOW), 3, NOW, 0.9, 1);
    s = schedule(s, 3, NOW + 10 * MINUTE, 0.9, 1);
    const lo = schedule(s, 3, s.due, 0.8, 3).due;
    const hi = schedule(s, 3, s.due, 0.97, 3).due;
    expect(hi).toBeLessThan(lo);
  });
});

describe('format', () => {
  it('formats delays in each interface language', () => {
    setLanguage('ru');
    expect(formatDelay(30_000)).toBe('<1 мин');
    expect(formatDelay(10 * MINUTE)).toBe('10 мин');
    expect(formatDelay(4 * DAY)).toBe('4 д');
    expect(formatDelay(45 * DAY)).toBe('1,5 мес');
    setLanguage('en');
    expect(formatDelay(10 * MINUTE)).toBe('10 min');
    expect(formatDelay(45 * DAY)).toBe('1.5 mo');
    setLanguage('de');
    expect(formatDelay(4 * DAY)).toBe('4 T.');
    expect(formatDelay(45 * DAY)).toBe('1,5 Mon.');
  });

  it('picks Russian plural forms', () => {
    setLanguage('ru');
    const answers = t().stats.answers;
    expect(answers(1)).toBe('1 ответ');
    expect(answers(3)).toBe('3 ответа');
    expect(answers(11)).toBe('11 ответов');
    expect(answers(21)).toBe('21 ответ');
  });
});
