import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Braces, CloudOff, Terminal } from "lucide-react";
import {
  HomeostateDevtools,
  type DevtoolsSource,
} from "@homeostate/tool-devtools";
import type { WebsocketProvider } from "y-websocket";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { accentClass, type PageMeta } from "../demos";
import { useSyncConnection } from "../hooks/useSyncConnection";
import { InlineCode } from "./InlineCode";
import { SyncStatus } from "./SyncStatus";
import { SyncToggle } from "./SyncToggle";

interface DemoLayoutProps {
  demo: Omit<PageMeta, "path">;
  provider: WebsocketProvider;
  /** The demo's store, adapter, backend and engine, for the devtools panel. */
  devtools: DevtoolsSource;
  /** Where the header's back button leads. */
  back: { to: string; label: string };
  /** A line under the demo about the room it joins. */
  footer: ReactNode;
  children: ReactNode;
}

export function DemoLayout({
  demo,
  provider,
  devtools,
  back,
  footer,
  children,
}: DemoLayoutProps) {
  const { status, online, toggle } = useSyncConnection(provider);
  const [inspecting, setInspecting] = useState(false);
  const Icon = demo.icon;

  return (
    <div
      className={cn(
        accentClass[demo.accent],
        "min-h-screen bg-background text-foreground",
      )}
    >
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to={back.to} />}
          >
            <ArrowLeft aria-hidden />
            {back.label}
          </Button>
          <div className="flex items-center gap-2">
            <SyncStatus status={status} />
            <SyncToggle online={online} onToggle={toggle} />
            <Button
              variant="outline"
              size="sm"
              aria-expanded={inspecting}
              onClick={() => setInspecting(!inspecting)}
            >
              <Braces aria-hidden />
              <span className="max-sm:sr-only">Inspect state</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <div className="mb-6 flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {demo.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {demo.description}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              To see this store, its Yjs document and a log of every change, and
              to edit them, open the devtools with{" "}
              <span className="font-medium text-foreground">Inspect state</span>{" "}
              or the round button in the bottom-right corner.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {status === "offline" && <OfflineNotice />}
          {status === "unreachable" && <ServerDownNotice />}

          {children}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          {footer}
        </p>
      </main>

      <HomeostateDevtools
        sources={[devtools]}
        open={inspecting}
        onOpenChange={setInspecting}
      />
    </div>
  );
}

function OfflineNotice() {
  return (
    <Alert role="status">
      <CloudOff />
      <AlertTitle>Offline. This tab is disconnected from sync.</AlertTitle>
      <AlertDescription>
        Edits stay in this tab and other tabs keep going without them. Hit{" "}
        <span className="font-medium text-foreground">Go online</span> and both
        sides merge, no edits lost.
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
        Tabs in this browser still sync with each other, but other browsers will
        not. Start the server with{" "}
        <InlineCode>
          pnpm --filter @homeostate/websocket-server-yjs dev
        </InlineCode>
        . This page reconnects on its own.
      </AlertDescription>
    </Alert>
  );
}
