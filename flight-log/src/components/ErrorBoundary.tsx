import React from 'react';
import { AlertTriangle, RotateCcw, Home, Copy } from 'lucide-react';

/** A chunk that 404s usually means a new version was deployed while this tab was open. */
export const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|ChunkLoadError|error loading dynamically/i.test(String((e as Error)?.message ?? e));

const RELOAD_KEY = 'skylog:chunk-reload';

/** lazy() that survives a deploy: on a missing chunk it reloads the page once to pick up the new version. */
export function lazyPage<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return React.lazy(async () => {
    try {
      const m = await load();
      if (!m || !m.default) throw new Error('Failed to fetch dynamically imported module');
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
      return m;
    } catch (e) {
      let tried = false;
      try { tried = sessionStorage.getItem(RELOAD_KEY) === '1'; sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* ignore */ }
      if (isChunkError(e) && !tried) {
        location.reload();
        return new Promise<never>(() => {}); // wait for the reload
      }
      throw e;
    }
  });
}

interface Props { resetKey?: string; children: React.ReactNode; compact?: boolean }
interface State { error: Error | null }

/** Catches a crash in one page so the rest of the app keeps working, and explains what to do. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Flight Log page error', error, info.componentStack); }
  componentDidUpdate(prev: Props) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    const details = `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}\n${location.href}\n${navigator.userAgent}`;
    return (
      <div role="alert" className={this.props.compact ? 'p-4' : 'mx-auto mt-10 max-w-lg'}>
        <div className="glass rounded-xl2 p-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-warn/15 text-warn ring-1 ring-warn/30"><AlertTriangle className="h-5 w-5" /></div>
          <h2 className="text-[17px] font-semibold">{chunk ? 'Flight Log was updated' : 'This page hit a problem'}</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            {chunk ? 'A newer version was published while this tab was open. Reload to get it. Your flights are safe.' : 'Your flights are safe; nothing was lost. Try again, or go back to the overview. If it keeps happening, copy the details and send them over.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={() => (chunk ? location.reload() : this.setState({ error: null }))}><RotateCcw className="h-4 w-4" />{chunk ? 'Reload' : 'Try again'}</button>
            {!chunk && <button className="btn-glass" onClick={() => location.reload()}>Reload app</button>}
            <a className="btn-glass" href="#/" onClick={() => this.setState({ error: null })}><Home className="h-4 w-4" />Overview</a>
          </div>
          {!chunk && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-[12px] text-faint">Technical details</summary>
              <pre className="mono mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-deep/70 p-2.5 text-[11px] text-muted ring-1 ring-white/[0.05]">{details}</pre>
              <button className="btn-ghost btn-sm mt-1" onClick={() => navigator.clipboard?.writeText(details)}><Copy className="h-3.5 w-3.5" />Copy details</button>
            </details>
          )}
        </div>
      </div>
    );
  }
}
