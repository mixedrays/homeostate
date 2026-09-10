import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Terminal } from 'lucide-react';
import type { WebsocketProvider } from 'y-websocket';
import { accentClass, type DemoMeta } from '../demos';
import { useProviderStatus } from '../hooks/useProviderStatus';
import { SYNC_ROOM } from '../sync';
import { SyncStatus } from './SyncStatus';
import { cx, focusRing } from './ui/classes';

interface DemoLayoutProps {
  demo: DemoMeta;
  provider: WebsocketProvider;
  children: ReactNode;
}

export function DemoLayout({ demo, provider, children }: DemoLayoutProps) {
  const status = useProviderStatus(provider);
  const Icon = demo.icon;

  return (
    <div className={cx(accentClass[demo.accent], 'min-h-screen bg-slate-50 text-slate-900')}>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4">
          <Link
            to="/"
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
              focusRing
            )}
          >
            <ArrowLeft size={16} aria-hidden />
            All demos
          </Link>
          <SyncStatus status={status} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <div className="mb-6 flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
            <Icon size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{demo.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{demo.description}</p>
          </div>
        </div>

        {status === 'offline' && <OfflineNotice />}

        <section
          aria-label={`${demo.name} todo list`}
          className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <div className="space-y-6">{children}</div>
        </section>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          Every demo joins the room{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-500">{SYNC_ROOM}</code>.
          Open another demo or a second tab to watch changes propagate.
        </p>
      </main>
    </div>
  );
}

function OfflineNotice() {
  return (
    <div
      role="status"
      className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <Terminal size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">Sync server unreachable.</p>
        <p className="mt-1 leading-relaxed">
          Tabs in this browser still sync with each other, but other browsers will not. Start the
          server with{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
            pnpm --filter @homeostate/websocket-server dev
          </code>
          . This page reconnects on its own.
        </p>
      </div>
    </div>
  );
}
