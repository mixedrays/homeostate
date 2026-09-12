import { Link } from 'react-router-dom';
import { ArrowRight, MonitorSmartphone, Terminal, Waypoints } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineCode } from '../components/InlineCode';
import { accentClass, demoList } from '../demos';
import { SYNC_SERVER_URL } from '../sync';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Waypoints size={24} aria-hidden />
          </span>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Homeostate Playground
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
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
                    className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/40">
                      <CardHeader>
                        <span className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon size={20} aria-hidden />
                        </span>
                        <CardTitle className="text-lg font-semibold">{demo.name}</CardTitle>
                        <CardDescription className="leading-relaxed">
                          {demo.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto">
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                          Open demo
                          <ArrowRight
                            size={16}
                            aria-hidden
                            className="transition group-hover:translate-x-0.5"
                          />
                        </span>
                      </CardContent>
                    </Card>
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
            <li>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-semibold">
                    <Terminal size={18} aria-hidden className="text-muted-foreground" />
                    1. Start the playground
                  </CardTitle>
                  <CardDescription>From the repo root, run:</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <pre className="overflow-x-auto rounded-lg bg-foreground px-3 py-2 text-xs text-background">
                    <code>pnpm playground</code>
                  </pre>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    This starts the app together with the WebSocket sync server the demos connect
                    to at <InlineCode>{SYNC_SERVER_URL}</InlineCode>. No separate terminal is
                    needed.
                  </p>
                </CardContent>
              </Card>
            </li>
            <li>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-semibold">
                    <MonitorSmartphone size={18} aria-hidden className="text-muted-foreground" />
                    2. Open two windows
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Open a demo twice, or two different demos side by side, then add and toggle
                    todos. The header of each demo shows its connection state and a{' '}
                    <span className="font-medium text-foreground">Go offline</span> button that
                    cuts that tab off from sync. Edit on both sides, then go back online and watch
                    the two histories merge.
                  </p>
                </CardContent>
              </Card>
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
