import { useEffect, useState } from 'react';
import { formatDelay, formatDue } from '../lib/format';
import { t } from '../lib/i18n';
import { deleteCard, resetCard, restoreCard, updateCard, useDb } from '../lib/store';
import type { Card, CardFields } from '../lib/types';
import { modKey, openEditor, toast } from '../lib/ui';
import { CardEditor } from './CardEditor';
import { Icon } from './Icon';

function fieldsOf(c: Card): CardFields {
  const { word, article, pos, forms, ipa, definition, en, ru, example, note } = c;
  return { word, article, pos, forms, ipa, definition, en, ru, example, note };
}

export function EditSheet({ id }: { id: string }) {
  const db = useDb();
  const card = db.cards.find((c) => c.id === id);
  const [fields, setFields] = useState<CardFields | null>(card ? fieldsOf(card) : null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const close = () => openEditor(null);

  function save() {
    if (fields && fields.word.trim()) updateCard(id, fields);
    close();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!card) close();
  }, [card]);

  if (!card || !fields) return null;

  function remove() {
    const removed = deleteCard(id);
    close();
    if (removed) toast(t().sheet.deleted(removed.word), { label: t().sheet.restore, run: () => restoreCard(removed) });
  }

  const s = card.srs.fwd;
  const now = Date.now();
  const L = t().sheet;

  return (
    <>
      <div className="overlay" onClick={close} />
      <aside className="sheet" role="dialog" aria-label={L.title}>
        <div className="sheet-head">
          <span className="eyebrow">{L.title}</span>
          <button className="icon-btn" onClick={close} aria-label={t().common.close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          <CardEditor value={fields} onChange={setFields} />
          <div className="card-stats">
            <div>
              <b>{s.state === 'new' ? '—' : formatDue(s.due, now)}</b>
              <span>{L.nextShow}</span>
            </div>
            <div>
              <b>{s.reps}</b>
              <span>{L.reps}</span>
            </div>
            <div>
              <b>{s.lapses}</b>
              <span>{L.lapses}</span>
            </div>
            <div>
              <b>{s.stability ? formatDelay(s.stability * 86_400_000) : '—'}</b>
              <span>{L.stability}</span>
            </div>
          </div>
        </div>
        <div className="sheet-foot">
          {confirmDelete ? (
            <>
              <button className="btn danger" onClick={remove}>
                {L.deleteForever}
              </button>
              <button className="btn quiet" onClick={() => setConfirmDelete(false)}>
                {L.keep}
              </button>
            </>
          ) : (
            <>
              <button className="btn quiet danger" onClick={() => setConfirmDelete(true)}>
                {L.delete}
              </button>
              {s.reps > 0 && (
                <button
                  className="btn quiet"
                  onClick={() => {
                    resetCard(id);
                    toast(L.resetDone);
                  }}
                >
                  {L.reset}
                </button>
              )}
            </>
          )}
          <span className="spacer" />
          <button className="btn primary" onClick={save} disabled={!fields.word.trim()}>
            {t().common.save} <span className="kbd">{modKey}+Enter</span>
          </button>
        </div>
      </aside>
    </>
  );
}
