import { useEffect, useRef, useState } from 'react';
import { CardEditor } from '../components/CardEditor';
import { fieldsFrom, lookup, lookupErrorText, LookupError, type LookupResult } from '../lib/lookup';
import { t } from '../lib/i18n';
import { addCard, deleteCard, findDuplicate, useDb } from '../lib/store';
import type { CardFields } from '../lib/types';
import { modKey, openEditor, takeAddDraft, toast } from '../lib/ui';

type Mode = 'one' | 'list';

export function Add() {
  const [mode, setMode] = useState<Mode>('one');
  const L = t().add;
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{L.title}</h1>
        <div className="segmented" role="group" aria-label={L.mode}>
          <button aria-pressed={mode === 'one'} onClick={() => setMode('one')}>
            {L.one}
          </button>
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            {L.list}
          </button>
        </div>
      </div>
      {mode === 'one' ? <AddOne /> : <AddList />}
    </div>
  );
}

type Status = 'idle' | 'loading' | 'found' | 'manual' | 'error';

function blank(word: string): CardFields {
  return { word, article: null, pos: '', forms: '', ipa: '', definition: '', en: '', ru: '', example: '', note: '' };
}

function AddOne() {
  useDb(); // re-check duplicates when the dictionary changes
  const [query, setQuery] = useState(() => takeAddDraft() ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [entry, setEntry] = useState(0);
  const [sense, setSense] = useState(0);
  const [fields, setFields] = useState<CardFields | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lookedUp = useRef('');

  const q = query.trim();

  async function run(text: string) {
    lookedUp.current = text;
    setStatus('loading');
    try {
      const r = await lookup(text);
      if (lookedUp.current !== text) return;
      setResult(r);
      setEntry(0);
      setSense(0);
      setFields(fieldsFrom(r));
      setStatus('found');
    } catch (e) {
      if (lookedUp.current !== text) return;
      setResult(null);
      setFields(blank(text.replace(/^(der|die|das)\s+/i, '')));
      setError(lookupErrorText(e));
      setStatus(e instanceof LookupError && e.message === 'not-found' ? 'manual' : 'error');
    }
  }

  useEffect(() => {
    if (!q) {
      lookedUp.current = '';
      setStatus('idle');
      setFields(null);
      setResult(null);
      return;
    }
    if (q === lookedUp.current) return;
    const t = setTimeout(() => lookedUp.current !== q && run(q), 650);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => inputRef.current?.focus(), []);

  function pickEntry(i: number) {
    if (!result) return;
    setEntry(i);
    setSense(0);
    setFields(fieldsFrom(result, i, 0));
  }

  function pickSense(i: number) {
    if (!result || !fields) return;
    const s = result.entries[entry]?.senses[i];
    if (!s) return;
    setSense(i);
    setFields({
      ...fields,
      definition: s.text,
      example: s.example || fields.example,
      en: s.en.length ? s.en.join(', ') : fields.en,
      ru: s.ru.length ? s.ru.join(', ') : fields.ru,
    });
  }

  function save() {
    if (!fields || !fields.word.trim() || status === 'loading') return;
    const card = addCard(fields);
    const label = fields.article ? `${fields.article} ${fields.word}` : fields.word;
    toast(t().add.added(label.trim()), { label: t().common.undo, run: () => deleteCard(card.id) });
    lookedUp.current = '';
    setFields(null);
    setResult(null);
    setStatus('idle');
    setQuery('');
    inputRef.current?.focus();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dup = fields ? findDuplicate(fields.word) : undefined;
  const entries = result?.entries ?? [];
  const L = t().add;

  return (
    <>
      <div className="lookup">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            if (q && q !== lookedUp.current) run(q);
            else save();
          }}
          placeholder={L.placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={L.inputLabel}
        />
        <div className="status">
          {status === 'loading' && (
            <>
              <span className="spinner" /> {L.searching}
            </>
          )}
          {status === 'found' && q === lookedUp.current && (
            <>
              <span>{L.enterToAdd}</span>
            </>
          )}
        </div>
      </div>

      {result?.baseFrom && (
        <div className="notice">
          {L.baseForm(result.baseFrom, result.title ?? '')}
        </div>
      )}
      {(status === 'manual' || status === 'error') && <div className="notice">{error}</div>}
      {dup && (
        <div className="notice">
          <span>{L.duplicate}</span>
          <button onClick={() => openEditor(dup.id)}>{t().common.open}</button>
        </div>
      )}

      {entries.length > 1 && (
        <div className="choices" role="group" aria-label={L.homonyms}>
          {entries.map((e, i) => (
            <button key={i} className="choice" aria-pressed={i === entry} onClick={() => pickEntry(i)}>
              {e.article ? `${e.article} ` : ''}
              {e.word}
              {e.senses[0] ? ` — ${e.senses[0].text}` : ''}
            </button>
          ))}
        </div>
      )}

      {fields && (
        <>
          <CardEditor
            value={fields}
            onChange={setFields}
            senses={result?.entries[entry]?.senses}
            senseIndex={sense}
            onPickSense={pickSense}
          />
          <div className="add-foot">
            <button className="btn primary" onClick={save} disabled={!fields.word.trim() || status === 'loading'}>
              {L.addButton} <span className="kbd">{modKey}+Enter</span>
            </button>
            <span className="source">
              {result?.title ? 'Wiktionary · CC BY-SA' : ''}
              {result && (result.machine.en || result.machine.ru) ? ` · ${L.machine}` : ''}
            </span>
          </div>
        </>
      )}

      {!fields && status === 'idle' && (
        <p className="about" style={{ marginTop: 8 }}>
          {L.tip}
        </p>
      )}
    </>
  );
}

interface BatchItem {
  word: string;
  status: 'wait' | 'loading' | 'added' | 'dup' | 'missing' | 'error';
  summary?: string;
}

function AddList() {
  const [text, setText] = useState('');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const cancel = useRef(false);

  const words = [
    ...new Set(
      text
        .split(/[\n;,]+/)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];

  async function start() {
    cancel.current = false;
    setRunning(true);
    const list: BatchItem[] = words.map((word) => ({ word, status: 'wait' }));
    setItems(list);
    const update = (i: number, patch: Partial<BatchItem>) => {
      list[i] = { ...list[i], ...patch };
      setItems([...list]);
    };
    for (let i = 0; i < list.length; i++) {
      if (cancel.current) break;
      const word = list[i].word;
      if (findDuplicate(word)) {
        update(i, { status: 'dup' });
        continue;
      }
      update(i, { status: 'loading' });
      try {
        const r = await lookup(word);
        const f = fieldsFrom(r);
        if (findDuplicate(f.word)) {
          update(i, { status: 'dup' });
        } else {
          addCard(f);
          update(i, {
            status: 'added',
            summary: [f.article ? `${f.article} ${f.word}` : f.word, f.ru || f.en].filter(Boolean).join(' — '),
          });
        }
      } catch (e) {
        update(i, { status: e instanceof LookupError && e.message === 'not-found' ? 'missing' : 'error' });
      }
      // Wiktionary asks API clients to keep a modest pace.
      await new Promise((r) => setTimeout(r, 700));
    }
    setRunning(false);
    const added = list.filter((x) => x.status === 'added').length;
    if (added) toast(t().add.addedMany(added));
  }

  const done = items.filter((x) => x.status !== 'wait' && x.status !== 'loading').length;
  const L = t().add;

  return (
    <div className="batch">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={L.listPlaceholder}
        spellCheck={false}
        disabled={running}
        aria-label={L.listLabel}
      />
      <div className="add-foot">
        {running ? (
          <button className="btn" onClick={() => (cancel.current = true)}>
            {L.stop}
          </button>
        ) : (
          <button className="btn primary" onClick={start} disabled={words.length === 0}>
            {L.findAndAdd(words.length)}
          </button>
        )}
        <span className="source">{L.skipNote}</span>
      </div>

      {items.length > 0 && (
        <>
          <div className="progress">
            <div style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <ul className="batch-list">
            {items.map((it) => (
              <li key={it.word}>
                <span>
                  <span className="w">{it.word}</span>
                  {it.summary && <span className="t">{it.summary}</span>}
                </span>
                <span className={`st ${it.status === 'missing' || it.status === 'error' ? 'bad' : ''}`}>
                  {it.status === 'loading' ? <span className="spinner" /> : L.status[it.status]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
