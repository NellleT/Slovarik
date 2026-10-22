import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { formatDue } from '../lib/format';
import { dayStart } from '../lib/queue';
import { DAY } from '../lib/fsrs';
import { t } from '../lib/i18n';
import { useDb } from '../lib/store';
import type { Card } from '../lib/types';
import { navigate, openEditor } from '../lib/ui';

type Filter = 'all' | 'new' | 'learning' | 'known';
type Sort = 'recent' | 'alpha' | 'due';

/** "Known" means FSRS expects the word to survive three weeks without review. */
const KNOWN_DAYS = 21;

function bucket(c: Card): Exclude<Filter, 'all'> {
  const s = c.srs.fwd;
  if (s.state === 'new') return 'new';
  if (s.state === 'review' && s.stability >= KNOWN_DAYS) return 'known';
  return 'learning';
}

const strip = (w: string) => w.toLowerCase().replace(/^(sich)\s+/, '');

export function Library() {
  const db = useDb();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const q = useDeferredValue(query.trim().toLowerCase());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const byBucket = useMemo(() => {
    const n = { all: db.cards.length, new: 0, learning: 0, known: 0 };
    for (const c of db.cards) n[bucket(c)]++;
    return n;
  }, [db.cards]);

  const rows = useMemo(() => {
    let list = db.cards.filter((c) => filter === 'all' || bucket(c) === filter);
    if (q) {
      list = list.filter((c) =>
        [c.word, c.en, c.ru, c.definition, c.forms, c.note].some((f) => f.toLowerCase().includes(q)),
      );
    }
    const sorted = [...list];
    if (sort === 'alpha') sorted.sort((a, b) => strip(a.word).localeCompare(strip(b.word), 'de'));
    else if (sort === 'due')
      sorted.sort((a, b) => (a.srs.fwd.state === 'new' ? 1 : 0) - (b.srs.fwd.state === 'new' ? 1 : 0) || a.srs.fwd.due - b.srs.fwd.due);
    else sorted.sort((a, b) => b.created - a.created);
    return sorted;
  }, [db.cards, filter, q, sort]);

  const now = Date.now();
  const endOfToday = dayStart(now) + DAY;
  const L = t().library;

  if (db.cards.length === 0) {
    return (
      <div className="empty">
        <h1>{L.emptyTitle}</h1>
        <p>{L.emptyText}</p>
        <div className="row">
          <button className="btn primary" onClick={() => navigate('add')}>
            {t().common.addWord}
          </button>
        </div>
      </div>
    );
  }

  const FILTERS: [Filter, string][] = [
    ['all', L.all],
    ['new', L.fresh],
    ['learning', L.learning],
    ['known', L.known],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">
          {L.title}<span className="count">{db.cards.length}</span>
        </h1>
      </div>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L.search}
            aria-label={L.searchLabel}
            spellCheck={false}
          />
        </div>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={L.sort}>
          <option value="recent">{L.sortRecent}</option>
          <option value="alpha">{L.sortAlpha}</option>
          <option value="due">{L.sortDue}</option>
        </select>
      </div>
      <div className="filters" role="group" aria-label={L.filter}>
        {FILTERS.map(([f, label]) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
            <span className="n">{byBucket[f]}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="list-empty">{L.nothing}</p>
      ) : (
        <ul className="rows">
          {rows.map((c) => {
            const s = c.srs.fwd;
            const due = s.state === 'new' ? L.newBadge : formatDue(s.due, now);
            return (
              <li key={c.id}>
                <button onClick={() => openEditor(c.id)}>
                  <span className="w">
                    {c.article && <span className={`a art-${c.article}`}>{c.article}</span>}
                    {c.word}
                  </span>
                  <span className="t">
                    {c.ru}
                    {c.ru && c.en && <span className="sep">·</span>}
                    {c.en}
                  </span>
                  <span className={`due ${s.state !== 'new' && s.due < endOfToday ? 'now' : ''}`}>{due}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
