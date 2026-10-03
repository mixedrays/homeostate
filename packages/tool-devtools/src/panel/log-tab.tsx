import { useRef, useState, type ChangeEvent } from "react";
import {
  ChevronRight,
  Download,
  History,
  Pause,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "cn";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import type { Inspector, InspectorSnapshot, LogEntry } from "../inspector";
import { deepEqual, formatPath, type DiffLine } from "../json";
import { parseLog, serializeLog } from "../log-file";
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

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** `homeostate-log-todos-2026-10-03T14-05-09.json` */
const fileNameFor = (source: string, at: Date): string => {
  const name = source.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const time = at.toISOString().slice(0, 19).replace(/:/g, "-");
  return `homeostate-log-${name.replace(/^-|-$/g, "") || "source"}-${time}.json`;
};

const download = (fileName: string, text: string): void => {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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
  name,
  snapshot,
  inspector,
}: {
  /** The source's name, for the exported file. */
  name: string;
  snapshot: InspectorSnapshot;
  inspector: Inspector;
}) {
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { log, paused } = snapshot;

  const restore = (id: number): void => {
    try {
      inspector.restore(id);
      setError(null);
    } catch (caught) {
      setError(`Restore failed: ${messageOf(caught)}`);
    }
  };

  const exportLog = (): void => {
    const now = new Date();
    download(fileNameFor(name, now), serializeLog(name, log, now.getTime()));
  };

  const importLog = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // So choosing the same file again imports it again.
    input.value = "";
    if (!file) return;
    try {
      inspector.importLog(parseLog(await file.text()).entries);
      setError(null);
    } catch (caught) {
      setError(`Import failed: ${messageOf(caught)}`);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
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
        <Button
          size="xs"
          variant="ghost"
          disabled={log.length === 0}
          onClick={exportLog}
          title="Save the log as a JSON file"
        >
          <Download />
          Export
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => fileInput.current?.click()}
          title="Replace the log with an exported file, to inspect and restore its states"
        >
          <Upload />
          Import
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Log file to import"
          hidden
          onChange={(event) => void importLog(event)}
        />
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
          {error}
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
          {entry.imported && (
            <Badge
              title="Read from an exported log file"
              className="h-4 bg-muted px-1.5 text-[10px] text-muted-foreground"
            >
              imported
            </Badge>
          )}
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
