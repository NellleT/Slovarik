import { useMemo } from 'react';
import { DAY } from '../lib/fsrs';
import { t } from '../lib/i18n';
import { dayStart, forecast } from '../lib/queue';
import { useDb } from '../lib/store';
import type { Db } from '../lib/types';

const WEEKS = 26;
const FORECAST_DAYS = 30;
const KNOWN_DAYS = 21;


function dailyCounts(db: Db): Map<number, number> {
  const out = new Map<number, number>();
  for (const [t] of db.log) {
    const d = dayStart(t);
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}

function streak(days: Map<number, number>, now: number): number {
  let d = dayStart(now);
  if (!days.has(d)) d -= DAY; // today isn't over yet
  let n = 0;
  while (days.has(d)) {
    n++;
    d = dayStart(d - DAY / 2);
  }
  return n;
}

export function Stats() {
  const db = useDb();
  const now = Date.now();

  const s = useMemo(() => {
    const days = dailyCounts(db);
    const monthAgo = now - 30 * DAY;
    let reviewed = 0;
    let correct = 0;
    for (const [t, , , rating, before] of db.log) {
      if (t >= monthAgo && before === 2) {
        reviewed++;
        if (rating > 1) correct++;
      }
    }
    let fresh = 0;
    let learning = 0;
    let known = 0;
    for (const c of db.cards) {
      const f = c.srs.fwd;
      if (f.state === 'new') fresh++;
      else if (f.state === 'review' && f.stability >= KNOWN_DAYS) known++;
      else learning++;
    }
    return {
      days,
      streak: streak(days, now),
      accuracy: reviewed ? Math.round((correct / reviewed) * 100) : null,
      fresh,
      learning,
      known,
      forecast: forecast(db, now, FORECAST_DAYS),
    };
  }, [db]);

  const L = t().stats;
  const dateFmt = new Intl.DateTimeFormat(t().locale, { day: 'numeric', month: 'long' });
  const monthFmt = new Intl.DateTimeFormat(t().locale, { month: 'short' });

  // Heatmap grid: columns are weeks (Mon–Sun), the last column holds today.
  const today = dayStart(now);
  const weekday = (new Date(today).getDay() + 6) % 7;
  const firstDay = today - (weekday + (WEEKS - 1) * 7) * DAY;
  const cells: { day: number; count: number; future: boolean }[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const day = dayStart(firstDay + i * DAY + DAY / 2);
    cells.push({ day, count: s.days.get(day) ?? 0, future: day > today });
  }
  const max = Math.max(1, ...cells.map((c) => c.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const total = cells.reduce((a, c) => a + c.count, 0);

  const months: { col: number; label: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const d = new Date(cells[w * 7].day);
    const prev = w > 0 ? new Date(cells[(w - 1) * 7].day) : null;
    if (!prev || prev.getMonth() !== d.getMonth()) months.push({ col: w, label: monthFmt.format(d).replace('.', '') });
  }
  // A month that only has its last days in the first column would crowd the next label.
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();

  const fmax = Math.max(1, ...s.forecast);
  const cardsTotal = db.cards.length;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{L.title}</h1>
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="value">{cardsTotal}</div>
          <div className="label">{L.words(cardsTotal)}</div>
        </div>
        <div className="tile">
          <div className="value">{s.known}</div>
          <div className="label">{L.known}</div>
        </div>
        <div className="tile">
          <div className="value">{s.streak}</div>
          <div className="label">{L.streak(s.streak)}</div>
        </div>
        <div className="tile">
          <div className="value">{s.accuracy === null ? '—' : `${s.accuracy}%`}</div>
          <div className="label">{L.accuracy}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>{L.activity}</h2>
          <span>{L.answers(total)}</span>
        </div>
        <div className="months" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
          {months.map((m) => (
            <span key={m.col} style={{ gridColumn: m.col + 1 }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="heatmap" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
          {cells.map((c) => (
            <i
              key={c.day}
              data-l={level(c.count)}
              data-future={c.future || undefined}
              title={c.future ? undefined : `${dateFmt.format(c.day)}: ${L.answers(c.count)}`}
            />
          ))}
        </div>
        <div className="legend">
          <span>{L.less}</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} style={{ background: `var(--heat-${l})` }} />
          ))}
          <span>{L.more}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{L.forecast}</h2>
          <span>{L.forecastNote}</span>
        </div>
        <div className="bars">
          {s.forecast.map((n, i) => (
            <div
              key={i}
              className={`bar ${i === 0 ? 'today' : ''}`}
              style={{ height: `${(n / fmax) * 100}%` }}
            >
              <span className="tip">
                {i === 0 ? L.axisToday : dateFmt.format(today + i * DAY + DAY / 2)}: {n}
              </span>
            </div>
          ))}
        </div>
        <div className="axis">
          <span>{L.axisToday}</span>
          <span>{L.axis2w}</span>
          <span>{L.axisMonth}</span>
        </div>
      </section>

      {cardsTotal > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>{L.where}</h2>
          </div>
          <div className="split">
            {[
              [s.known, 'var(--heat-4)'],
              [s.learning, 'var(--heat-2)'],
              [s.fresh, 'var(--heat-1)'],
            ].map(([n, bg], i) =>
              Number(n) > 0 ? <div key={i} style={{ flex: Number(n), background: String(bg) }} /> : null,
            )}
          </div>
          <div className="split-legend">
            <span>
              <i className="swatch" style={{ background: 'var(--heat-4)' }} /> {L.learned} <b>{s.known}</b>
            </span>
            <span>
              <i className="swatch" style={{ background: 'var(--heat-2)' }} /> {L.learning} <b>{s.learning}</b>
            </span>
            <span>
              <i className="swatch" style={{ background: 'var(--heat-1)' }} /> {L.fresh} <b>{s.fresh}</b>
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
