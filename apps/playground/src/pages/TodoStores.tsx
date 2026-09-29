import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DemoCard } from "../components/DemoCard";
import { accentClass, angularDemo, apps, demoList } from "../demos";

export default function TodoStores() {
  const app = apps.todo;
  const Icon = app.icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/" />}
          className="mb-6 -ml-2.5"
        >
          <ArrowLeft aria-hidden />
          All demos
        </Button>

        <header className="mb-10">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                accentClass[app.accent],
                "inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground",
              )}
            >
              <Icon size={24} aria-hidden />
            </span>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {app.title}
            </h1>
          </div>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            One shared todo list, {demoList.length + 1} state managers across
            React and Angular. Every store joins the same Yjs room, so a change
            made in any of them shows up in the others and in every other open
            tab. Pick a store to open its version.
          </p>
        </header>

        <section aria-labelledby="stores-heading">
          <h2 id="stores-heading" className="sr-only">
            Stores
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {[...demoList, angularDemo].map((demo) => (
              <li key={demo.path}>
                <DemoCard page={demo} action="Open demo" />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
