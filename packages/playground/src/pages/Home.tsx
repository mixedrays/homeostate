import { Link } from 'react-router-dom';
import { ArrowRight, MonitorSmartphone, Terminal, Waypoints } from 'lucide-react';
import { accentClass, demoList } from '../demos';
import { SYNC_SERVER_URL } from '../sync';
import { cx, focusRing } from '../components/ui/classes';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Waypoints size={24} aria-hidden />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Homeostate Playground</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
            One shared todo list, {demoList.length} state managers. Every demo joins the same Yjs
            room, so a change made in any of them shows up in the others and in every other open
            tab.
          </p>
        </header>

        <section aria-labelledby="demos-heading">
          <h2 id="demos-heading" className="sr-only">
            Demos
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {demoList.map((demo) => {
              const Icon = demo.icon;
              return (
                <li key={demo.id} className={accentClass[demo.accent]}>
                  <Link
                    to={demo.path}
                    className={cx(
                      'group flex h-full flex-col rounded-2xl bg-white p-5 shadow-xs ring-1 ring-slate-200 transition',
                      'hover:-translate-y-0.5 hover:shadow-md hover:ring-accent-200',
                      focusRing
                    )}
                  >
                    <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                      <Icon size={20} aria-hidden />
                    </span>
                    <h3 className="text-lg font-semibold">{demo.name}</h3>
                    <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">
                      {demo.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-700">
                      Open demo
                      <ArrowRight
                        size={16}
                        aria-hidden
                        className="transition group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="steps-heading" className="mt-10">
          <h2 id="steps-heading" className="sr-only">
            Getting started
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2">
            <li className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Terminal size={18} aria-hidden className="text-slate-500" />
                <h3 className="font-semibold">1. Start the sync server</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                The demos connect to{' '}
                <code className="rounded-sm bg-slate-100 px-1 py-0.5 font-mono text-xs">
                  {SYNC_SERVER_URL}
                </code>
                . From the repo root, run:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">
                <code>pnpm --filter @homeostate/websocket-server dev</code>
              </pre>
              <p className="mt-2 text-xs text-slate-500">
                Or run <code className="font-mono">pnpm dev</code> to start the server and this app
                together.
              </p>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <MonitorSmartphone size={18} aria-hidden className="text-slate-500" />
                <h3 className="font-semibold">2. Open two windows</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Open a demo twice, or two different demos side by side, then add and toggle todos.
                The header of each demo shows its connection state and a{' '}
                <span className="font-medium">Go offline</span> button that cuts that tab off from
                sync. Edit on both sides, then go back online and watch the two histories merge.
              </p>
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
