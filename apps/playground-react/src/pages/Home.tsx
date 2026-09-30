import {
  ArrowLeft,
  MonitorSmartphone,
  Terminal,
  Waypoints,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DemoCard } from "../components/DemoCard";
import { InlineCode } from "../components/InlineCode";
import { appList, PLAYGROUNDS_URL } from "../demos";
import { SYNC_SERVER_URL } from "../sync";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<a href={PLAYGROUNDS_URL} />}
          className="mb-6 -ml-2.5"
        >
          <ArrowLeft aria-hidden />
          All playgrounds
        </Button>

        <header className="mb-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Waypoints size={24} aria-hidden />
            </span>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              React Playground
            </h1>
          </div>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Small React apps that keep their state in an ordinary store and sync
            it through homeostate into a Yjs room, so every open tab works on
            the same data. Pick one to try.
          </p>
        </header>

        <section aria-labelledby="demos-heading">
          <h2 id="demos-heading" className="sr-only">
            Demos
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {appList.map((app) => (
              <li key={app.id}>
                <DemoCard page={app} action={app.action}>
                  <ul
                    aria-label="Built with"
                    className="flex flex-wrap gap-1.5"
                  >
                    {app.tags.map((tag) => (
                      <li key={tag}>
                        <Badge variant="secondary">{tag}</Badge>
                      </li>
                    ))}
                  </ul>
                </DemoCard>
              </li>
            ))}
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
                    <Terminal
                      size={18}
                      aria-hidden
                      className="text-muted-foreground"
                    />
                    1. Start the playground
                  </CardTitle>
                  <CardDescription>From the repo root, run:</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <pre className="overflow-x-auto rounded-lg bg-foreground px-3 py-2 text-xs text-background">
                    <code>pnpm playground:react</code>
                  </pre>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    This starts the React app together with the WebSocket sync
                    server the demos connect to at{" "}
                    <InlineCode>{SYNC_SERVER_URL}</InlineCode>.{" "}
                    <InlineCode>pnpm playground</InlineCode> starts every
                    framework's playground at once.
                  </p>
                </CardContent>
              </Card>
            </li>
            <li>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-semibold">
                    <MonitorSmartphone
                      size={18}
                      aria-hidden
                      className="text-muted-foreground"
                    />
                    2. Open two windows
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Open a demo in two tabs side by side and edit in both. The
                    header of each demo shows its connection state and a{" "}
                    <span className="font-medium text-foreground">
                      Go offline
                    </span>{" "}
                    button that cuts that tab off from sync. Edit on both sides,
                    then go back online and watch the two histories merge.
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
