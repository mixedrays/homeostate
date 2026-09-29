import { useState } from "react";
import { ChevronRight, History, Pause, Play, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import type { Inspector, InspectorSnapshot, LogEntry } from "../inspector";
import { deepEqual, formatPath, type DiffLine } from "../json";
import { CopyButton } from "./copy-button";
import { JsonValue, OriginBadge } from "./value";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatTime = (at: number): string =>
  `${timeFormat.format(at)}.${String(at % 1000).padStart(3, "0")}`;

const SUMMARY_PATHS = 3;

const summarize = (entry: LogEntry): string => {
  if (entry.label) return entry.label;
  if (entry.origin === "initial") return "Initial state";
  const paths = [...new Set(entry.diff.map((line) => formatPath(line.path)))];
  const shown = paths.slice(0, SUMMARY_PATHS).join(", ");
  return paths.length > SUMMARY_PATHS
    ? `${shown} +${paths.length - SUMMARY_PATHS}`
    : shown;
};

export function LogTab({
  snapshot,
  inspector,
}: {
  snapshot: InspectorSnapshot;
  inspector: Inspector;
}) {
  const [error, setError] = useState<string | null>(null);
  const { log, paused } = snapshot;

  const restore = (id: number): void => {
    try {
      inspector.restore(id);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
        <Button
          size="xs"
          variant="outline"
          aria-pressed={paused}
          onClick={() => inspector.setPaused(!paused)}
        >
          {paused ? <Play /> : <Pause />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={log.length === 0}
          onClick={inspector.clearLog}
        >
          <Trash2 />
          Clear
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {log.length} {log.length === 1 ? "entry" : "entries"}
          {paused && " · paused"}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="border-b px-3 py-1.5 text-xs text-destructive"
        >
          Restore failed: {error}
        </p>
      )}

      {log.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          {paused
            ? "Recording is paused."
            : "No changes yet. Change the store, here or in the app."}
        </p>
      ) : (
        <ol
          aria-label="Changes, newest first"
          className="min-h-0 flex-1 overflow-auto"
        >
          {log
            .slice()
            .reverse()
            .map((entry) => (
              <LogRow
                key={entry.id}
                entry={entry}
                snapshot={snapshot}
                onRestore={() => restore(entry.id)}
              />
            ))}
        </ol>
      )}
    </div>
  );
}

function LogRow({
  entry,
  snapshot,
  onRestore,
}: {
  entry: LogEntry;
  snapshot: InspectorSnapshot;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = open && deepEqual(entry.state, snapshot.store);

  return (
    <li className="border-b">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs outline-none hover:bg-muted/60 focus-visible:bg-muted/60">
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
            #{entry.id}
          </span>
          <OriginBadge origin={entry.origin} />
          <span className="min-w-0 flex-1 truncate font-mono">
            {summarize(entry)}
          </span>
          <time
            dateTime={new Date(entry.at).toISOString()}
            className="shrink-0 text-muted-foreground tabular-nums"
          >
            {formatTime(entry.at)}
          </time>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-2 pl-8">
          {entry.diff.length > 0 && (
            <ul className="space-y-0.5 font-mono text-xs">
              {entry.diff.map((line, index) => (
                <DiffRow key={index} line={line} />
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={current}
              onClick={onRestore}
              title="Write this state to the store; the engine syncs it to peers"
            >
              <History />
              {current ? "Current state" : "Restore this state"}
            </Button>
            <CopyButton
              label="Copy state"
              text={JSON.stringify(entry.state, null, 2)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

const signs: Record<DiffLine["kind"], { sign: string; className: string }> = {
  insert: { sign: "+", className: "text-emerald-600 dark:text-emerald-400" },
  update: { sign: "~", className: "text-amber-600 dark:text-amber-400" },
  delete: { sign: "−", className: "text-rose-600 dark:text-rose-400" },
};

function DiffRow({ line }: { line: DiffLine }) {
  const { sign, className } = signs[line.kind];
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5">
      <span aria-label={line.kind} className={cn("w-2 shrink-0", className)}>
        {sign}
      </span>
      <span className="text-sky-700 dark:text-sky-400">
        {formatPath(line.path)}
      </span>
      {line.kind !== "insert" && (
        <JsonValue
          value={line.before}
          className={cn(line.kind === "update" && "line-through opacity-60")}
        />
      )}
      {line.kind === "update" && (
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      )}
      {line.kind !== "delete" && <JsonValue value={line.after} />}
    </li>
  );
}
