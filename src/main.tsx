import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { t } from './lib/i18n';
import { initStore } from './lib/store';
import { isDesktop, openDataDir } from './lib/storage';

const root = createRoot(document.getElementById('root')!);

initStore().then(
  () =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    ),
  // Never start with an empty dictionary on top of a file we failed to read:
  // the first save would overwrite it.
  (e) =>
    root.render(
      <div className="empty" style={{ height: '100vh' }}>
        <h1>{t().errors.loadTitle}</h1>
        <p>{t().errors.loadText}</p>
        <p className="note" style={{ maxWidth: 520 }}>
          {String(e)}
        </p>
        {isDesktop && (
          <div className="row">
            <button className="btn primary" onClick={() => openDataDir()}>
              {t().settings.openFolder}
            </button>
          </div>
        )}
      </div>,
    ),
);
