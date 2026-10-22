import { Component, type ReactNode } from 'react';
import { t } from '../lib/i18n';

/** Keeps a rendering bug from blanking the whole window. The dictionary itself is already saved. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const L = t().errors;
    return (
      <div className="empty" style={{ height: '100vh' }}>
        <h1>{L.crashTitle}</h1>
        <p>{L.crashText}</p>
        <p className="note" style={{ maxWidth: 520 }}>
          {this.state.error.message}
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => location.reload()}>
            {L.restart}
          </button>
        </div>
      </div>
    );
  }
}
