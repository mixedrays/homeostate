import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CloudOff, Terminal } from 'lucide-react';
import type { WebsocketProvider } from 'y-websocket';
import type { Doc } from 'yjs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { accentClass, type DemoMeta } from '../demos';
import { useSyncConnection } from '../hooks/useSyncConnection';
import { SYNC_MAP_NAME, SYNC_ROOM } from '../sync';
import { InlineCode } from './InlineCode';
import { SyncedStatePanel } from './inspector/SyncedStatePanel';
import { SyncStatus } from './SyncStatus';
import { SyncToggle } from './SyncToggle';

interface DemoLayoutProps {
  demo: DemoMeta;
  provider: WebsocketProvider;
  doc: Doc;
  children: ReactNode;
}

export function DemoLayout({ demo, provider, doc, children }: DemoLayoutProps) {
  const { status, online, toggle } = useSyncConnection(provider);
  const Icon = demo.icon;

  return (
    <div className={cn(accentClass[demo.accent], 'min-h-screen bg-background text-foreground')}>
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4 lg:max-w-6xl">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
            <ArrowLeft aria-hidden />
            All demos
          </Button>
          <div className="flex items-center gap-2">
            <SyncStatus status={status} />
            <SyncToggle online={online} onToggle={toggle} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10 lg:max-w-6xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{demo.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{demo.description}</p>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-4">
            {status === 'offline' && <OfflineNotice />}
            {status === 'unreachable' && <ServerDownNotice />}

            <Card role="region" aria-label={`${demo.name} todo list`}>
              <CardContent className="space-y-6 sm:px-6 sm:py-2">{children}</CardContent>
            </Card>
          </div>

          <aside className="mt-6 min-w-0 lg:sticky lg:top-20 lg:mt-0">
            <SyncedStatePanel doc={doc} mapName={SYNC_MAP_NAME} />
          </aside>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Every demo joins the room <InlineCode>{SYNC_ROOM}</InlineCode>. Open another demo or a
          second tab to watch changes propagate.
        </p>
      </main>
    </div>
  );
}

function OfflineNotice() {
  return (
    <Alert role="status">
      <CloudOff />
      <AlertTitle>Offline. This tab is disconnected from sync.</AlertTitle>
      <AlertDescription>
        Edits stay in this tab and other tabs keep going without them. Hit{' '}
        <span className="font-medium text-foreground">Go online</span> and both sides merge, no
        edits lost.
      </AlertDescription>
    </Alert>
  );
}

function ServerDownNotice() {
  return (
    <Alert role="status" variant="destructive">
      <Terminal />
      <AlertTitle>Sync server unreachable.</AlertTitle>
      <AlertDescription>
        Tabs in this browser still sync with each other, but other browsers will not. Start the
        server with <InlineCode>pnpm --filter @homeostate/websocket-server dev</InlineCode>. This
        page reconnects on its own.
      </AlertDescription>
    </Alert>
  );
}
