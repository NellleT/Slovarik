import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CardView, spokenForm } from '../components/CardView';
import { Icon } from '../components/Icon';
import { newSrs, preview, seedFor } from '../lib/fsrs';
import { formatDelay, formatDue, formatDuration } from '../lib/format';
import { t } from '../lib/i18n';
import { doneToday, forecast, itemKey, nextItem, type QueueItem } from '../lib/queue';
import { speak } from '../lib/speech';
import { answer, canUndo, undoAnswer, useDb } from '../lib/store';
import type { Direction, Rating } from '../lib/types';
import { isTyping, modKey, navigate, openEditor, openSettings, useUi } from '../lib/ui';

const RATINGS: { r: Rating; cls: string }[] = [
  { r: 1, cls: 'again' },
  { r: 2, cls: 'hard' },
  { r: 3, cls: 'good' },
  { r: 4, cls: 'easy' },
];

export function Review() {
  const db = useDb();
  const ui = useUi();
  const [cur, setCur] = useState<{ id: string; dir: Direction } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const shownAt = useRef(Date.now());
  // Keys can arrive faster than React re-renders; this ref keeps a quick
  // "space, 3, 3" from answering the same card twice.
  const phase = useRef<'question' | 'answer' | 'busy'>('busy');

  const next = useMemo(() => nextItem(db, Date.now(), lastKey), [db, lastKey, tick]);

  let item: QueueItem | null = null;
  if (cur) {
    const card = db.cards.find((c) => c.id === cur.id);
    if (card) {
      const srs = cur.dir === 'fwd' ? card.srs.fwd : (card.srs.rev ?? newSrs(card.created));
      item = { card, dir: cur.dir, srs };
    }
  }

  // Pick the next card whenever nothing is on screen (or the current one was deleted).
  useLayoutEffect(() => {
    if (cur && !item) setCur(null);
    if (!cur && next.item) {
      setCur({ id: next.item.card.id, dir: next.item.dir });
      setRevealed(false);
      phase.current = 'question';
      shownAt.current = Date.now();
    }
  }, [cur, item, next]);

  // Learning cards come back after a few minutes; check periodically while idle.
  useEffect(() => {
    if (item) return;
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [item]);

  const autoSpeak = db.settings.autoSpeak;
  useEffect(() => {
    if (!item || !autoSpeak) return;
    if ((item.dir === 'fwd' && !revealed) || (item.dir === 'rev' && revealed)) speak(spokenForm(item.card));
  }, [item?.card.id, item?.dir, revealed, autoSpeak]);

  const intervals = useMemo(
    () =>
      item ? preview(item.srs, Date.now(), db.settings.retention, seedFor(item.card.id, item.dir, item.srs.reps)) : null,
    [item?.srs, item?.card.id, item?.dir, db.settings.retention],
  );

  function reveal() {
    if (phase.current !== 'question') return;
    phase.current = 'answer';
    setRevealed(true);
  }

  function rate(r: Rating) {
    if (!item || phase.current !== 'answer') return;
    phase.current = 'busy';
    answer(item, r, Date.now() - shownAt.current);
    setLastKey(itemKey(item));
    setCur(null);
    setRevealed(false);
  }

  function undo() {
    const u = undoAnswer();
    if (!u) return;
    setCur(u);
    setRevealed(false);
    phase.current = 'question';
    shownAt.current = Date.now();
  }

  // A layout effect re-binds before the next input event, so a key pressed
  // right after a card appears never sees the previous render's state.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.editing || ui.settings || isTyping(e)) return;
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !item) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (phase.current === 'question') reveal();
        else rate(3);
      } else if (/^(Digit|Numpad)[1-4]$/.test(e.code)) {
        rate(Number(e.code.slice(-1)) as Rating);
      } else if (e.code === 'KeyE') {
        openEditor(item.card.id);
      } else if (e.code === 'KeyP') {
        speak(spokenForm(item.card));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const L = t();

  if (db.cards.length === 0) {
    return (
      <div className="empty">
        <p className="eyebrow">Slovarik</p>
        <h1>{L.review.emptyTitle}</h1>
        <p>{L.review.emptyText}</p>
        <div className="row">
          <button className="btn primary" onClick={() => navigate('add')}>
            {L.common.addWord}
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    if (next.item) return null; // the effect above is about to show it
    return <Done waitUntil={next.waitUntil} />;
  }

  const c = next.counts;
  const kind = item.srs.state === 'new' ? 'fresh' : item.srs.state === 'review' ? 'review' : 'learning';

  return (
    <div className="review">
      <div className="review-head">
        <div className="counts">
          <span className={kind === 'fresh' ? 'current' : ''} title={L.review.freshTitle}>
            <i className="dot dot-fresh" />
            <b>{c.fresh}</b> {L.review.fresh(c.fresh)}
          </span>
          <span className={kind === 'learning' ? 'current' : ''} title={L.review.learningTitle}>
            <i className="dot dot-learning" />
            <b>{c.learning}</b> {L.review.learning}
          </span>
          <span className={kind === 'review' ? 'current' : ''} title={L.review.dueTitle}>
            <i className="dot dot-review" />
            <b>{c.review}</b> {L.review.due}
          </span>
        </div>
        <div className="head-actions">
          <button className="icon-btn" onClick={undo} disabled={!canUndo()} title={L.review.undo(modKey)}>
            <Icon name="undo" />
          </button>
          <button className="icon-btn" onClick={() => openEditor(item!.card.id)} title={L.review.edit}>
            <Icon name="edit" />
          </button>
        </div>
      </div>

      <article
        className={`card${revealed ? ' revealed' : ''}`}
        key={itemKey(item)}
        onClick={reveal}
        style={{ cursor: revealed ? 'default' : 'pointer' }}
      >
        <CardView card={item.card} dir={item.dir} revealed={revealed} hideArticle={db.settings.hideArticle} />
      </article>

      <div className="actions">
        {!revealed ? (
          <button className="reveal" onMouseDown={(e) => e.preventDefault()} onClick={reveal}>
            {L.review.show} <span className="kbd">{L.common.space}</span>
          </button>
        ) : (
          RATINGS.map(({ r, cls }) => (
            <button
              key={r}
              className={`rate ${cls}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => rate(r)}
              title={L.review.key(r)}
            >
              <span className="label">{L.review.ratings[r - 1]}</span>
              <span className="ivl">{intervals ? formatDelay(intervals[r]) : ''}</span>
            </button>
          ))
        )}
      </div>
      <div className="hints">
        <span>
          <span className="kbd">1</span>–<span className="kbd">4</span> {L.review.hintRate}
        </span>
        <span>
          <span className="kbd">E</span> {L.review.hintEdit}
        </span>
        <span>
          <span className="kbd">P</span> {L.review.hintSpeak}
        </span>
      </div>
    </div>
  );
}

function Done({ waitUntil }: { waitUntil: number | null }) {
  const db = useDb();
  const now = Date.now();
  const today = doneToday(db, now);
  const tomorrow = forecast(db, now, 2)[1];
  const freshLeft = db.cards.filter((c) => c.srs.fwd.state === 'new').length;
  const tomorrowNew = Math.min(freshLeft, db.settings.newPerDay);
  const minutes = waitUntil ? Math.max(1, Math.ceil((waitUntil - now) / 60_000)) : 0;
  const nextDue = Math.min(...db.cards.filter((c) => c.srs.fwd.state !== 'new').map((c) => c.srs.fwd.due));
  const L = t();

  return (
    <div className="empty">
      <p className="eyebrow">{waitUntil ? L.done.pause : L.done.allDone}</p>
      <h1>{waitUntil ? L.done.nextIn(formatDelay(waitUntil - now)) : L.done.finished}</h1>
      <p>
        {today.total > 0 ? L.done.today(today.total, formatDuration(today.ms)) : ''}
        {waitUntil
          ? L.done.comeBack(minutes)
          : tomorrow + tomorrowNew > 0
            ? L.done.tomorrow(tomorrow, tomorrowNew)
            : Number.isFinite(nextDue)
              ? L.done.nextReview(formatDue(nextDue, now))
              : L.done.addMore}
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => navigate('add')}>
          {L.common.addWords}
        </button>
        {freshLeft > 0 && !waitUntil && (
          <button className="btn" onClick={() => openSettings(true)}>
            {L.done.newLimit(db.settings.newPerDay)}
          </button>
        )}
      </div>
    </div>
  );
}
