import { useEffect, useMemo } from 'react';
import { EditSheet } from './components/EditSheet';
import { Icon } from './components/Icon';
import { SettingsDialog } from './components/SettingsDialog';
import { SyncIndicator } from './components/Sync';
import { t } from './lib/i18n';
import { counts, buildQueue } from './lib/queue';
import { useDb } from './lib/store';
import { dismissToast, isMac, navigate, openSettings, useUi, type Screen } from './lib/ui';
import { Add } from './screens/Add';
import { Library } from './screens/Library';
import { Review } from './screens/Review';
import { Stats } from './screens/Stats';

const TABS: Screen[] = ['review', 'add', 'library', 'stats'];

export function App() {
  const db = useDb();
  const ui = useUi();

  const due = useMemo(() => {
    const now = Date.now();
    const c = counts(buildQueue(db, now), now);
    return c.fresh + c.learning + c.review;
  }, [db]);

  useEffect(() => {
    const root = document.documentElement;
    if (db.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', db.settings.theme);
  }, [db.settings.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const n = /^Digit([1-4])$/.exec(e.code);
      if (n) {
        e.preventDefault();
        navigate(TABS[Number(n[1]) - 1]);
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        navigate('add');
      } else if (e.code === 'Comma') {
        e.preventDefault();
        openSettings(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const L = t();

  return (
    <div className="app" data-platform={isMac ? 'mac' : 'other'}>
      <header className="topbar" data-tauri-drag-region>
        <span className="brand">Slovarik</span>
        <nav className="tabs">
          {TABS.map((id) => (
            <button
              key={id}
              className="tab"
              aria-current={ui.screen === id ? 'page' : undefined}
              // Keep focus off the tab on click so Space goes to the card, not the button.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => navigate(id)}
            >
              {L.nav[id]}
              {id === 'review' && due > 0 && <span className="badge">{due}</span>}
            </button>
          ))}
        </nav>
        <div className="topbar-end">
          <SyncIndicator />
          <button className="icon-btn" onClick={() => openSettings(true)} title={L.nav.settings} aria-label={L.nav.settings}>
            <Icon name="sliders" />
          </button>
        </div>
      </header>

      <main>
        {ui.screen === 'review' && <Review />}
        {ui.screen === 'add' && <Add />}
        {ui.screen === 'library' && <Library />}
        {ui.screen === 'stats' && <Stats />}
      </main>

      {ui.editing && <EditSheet key={ui.editing} id={ui.editing} />}
      {ui.settings && <SettingsDialog />}
      {ui.toast && (
        <div className="toast" key={ui.toast.id} role="status">
          <span>{ui.toast.text}</span>
          {ui.toast.action && (
            <button
              onClick={() => {
                ui.toast?.action?.run();
                dismissToast();
              }}
            >
              {ui.toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
