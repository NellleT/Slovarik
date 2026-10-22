import { useState, type FormEvent } from 'react';
import { formatAgo } from '../lib/format';
import { t } from '../lib/i18n';
import { connect, disconnect, openTokenPage, syncNow, useSync, type SyncError, type SyncState } from '../lib/sync';
import { Icon } from './Icon';

function statusLine(s: SyncState): string {
  const L = t().sync;
  if (s.status === 'syncing') return L.syncing;
  if (s.status === 'error' && s.error) return L.errors[s.error];
  return s.lastSync ? L.lastSync(formatAgo(s.lastSync)) : L.never;
}

/** Sync icon in the header: spins while syncing, shows a dot after an error, syncs on click. */
export function SyncIndicator() {
  const s = useSync();
  if (s.status === 'off') return null;
  return (
    <button
      className={`icon-btn sync-btn ${s.status}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void syncNow()}
      title={statusLine(s)}
      aria-label={t().sync.syncNow}
    >
      <Icon name="sync" />
      {s.status === 'error' && <i className="sync-dot" />}
    </button>
  );
}

/** The "Sync" section of the settings dialog. */
export function SyncSection() {
  const s = useSync();
  const L = t().sync;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SyncError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connect(token);
      setToken('');
    } catch (kind) {
      setError(kind as SyncError);
    } finally {
      setBusy(false);
    }
  }

  if (s.status === 'off') {
    return (
      <section>
        <h3 className="eyebrow">{L.title}</h3>
        <p className="sync-text">{L.intro}</p>
        <p className="sync-text">
          {L.step}{' '}
          <button className="link" onClick={openTokenPage}>
            {L.openTokenPage} ↗
          </button>
        </p>
        <form className="sync-connect" onSubmit={submit}>
          <input
            className="text-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_…"
            aria-label={L.tokenLabel}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn primary" disabled={!token.trim() || busy}>
            {busy ? L.connecting : L.connect}
          </button>
        </form>
        {error && <p className="sync-error">{L.errors[error]}</p>}
        <p className="sync-note">{L.tokenNote}</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="eyebrow">{L.title}</h3>
      <div className="setting">
        <div>
          <div className="label">{s.login ? L.connectedAs(s.login) : L.title}</div>
          <div className={`hint ${s.status === 'error' ? 'sync-error' : ''}`}>{statusLine(s)}</div>
        </div>
        <div className="sync-actions">
          <button className="btn" onClick={() => void syncNow()} disabled={s.status === 'syncing'}>
            {L.syncNow}
          </button>
          <button className="btn quiet" onClick={() => void disconnect()}>
            {L.disconnect}
          </button>
        </div>
      </div>
    </section>
  );
}
