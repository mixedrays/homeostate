import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import type {
  Inspector,
  InspectorSnapshot,
  LogEntry,
  LogOrigin,
} from "../inspector";
import { deepEqual, diffJson, formatPath, type JsonObject } from "../json";
import { usePersistedState } from "../lib/use-persisted-state";
import { parseLog, serializeLog } from "../log-file";
import { CopyButton } from "./copy-button";
import { FilterInput } from "./filter-input";
import { normalizeQuery } from "./format";
import { JsonCodeArea } from "./json-code";
import { JsonDiff } from "./json-diff";
import { JsonTree } from "./json-tree";
import { OriginBadge } from "./value";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatTime = (at: number): string =>
  `${timeFormat.format(at)}.${String(at % 1000).padStart(3, "0")}`;

const SUMMARY_PATHS = 3;

/** Origins the log can be filtered by; the initial state always shows. */
const ORIGINS: LogOrigin[] = ["local", "remote", "devtools"];

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

/** Whether `entry` shows for `origins` and a path `query`, matched against its paths and label. */
const matches = (
  entry: LogEntry,
  origins: readonly string[],
  query: string,
): boolean =>
  (entry.origin === "initial" || origins.includes(entry.origin)) &&
  (query === "" ||
    summarize(entry).toLowerCase().includes(query) ||
    entry.diff.some((line) =>
      formatPath(line.path).toLowerCase().includes(query),
    ));

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
  const [query, setQuery] = usePersistedState<string>("logFilter", "");
  const [storedOrigins, setOrigins] = usePersistedState(
    "logOrigins",
    ORIGINS.join(","),
  );
  const origins = storedOrigins.split(",");
  const needle = normalizeQuery(query);
  const filtered =
    needle !== "" || ORIGINS.some((origin) => !origins.includes(origin));
  const shown = filtered
    ? log.filter((entry) => matches(entry, origins, needle))
    : log;
  const clearFilter = (): void => {
    setQuery("");
    setOrigins(ORIGINS.join(","));
  };

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
      <div className="flex flex-wrap items-center gap-1.5 border-b p-1.5">
        <Button
          size="xs"
          variant="outline"
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
          {filtered && `${shown.length} of `}
          {log.length} {log.length === 1 ? "entry" : "entries"}
          {paused && " · paused"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 border-b p-1.5">
        <FilterInput
          value={query}
          onChange={setQuery}
          label="Filter by path"
          placeholder="Filter by path"
        />
        <ToggleGroup
          aria-label="Origins"
          variant="outline"
          size="xs"
          multiple
          value={origins}
          onValueChange={(next: string[]) =>
            setOrigins(
              ORIGINS.filter((origin) => next.includes(origin)).join(","),
            )
          }
        >
          {ORIGINS.map((origin) => (
            <ToggleGroupItem key={origin} value={origin}>
              {origin}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
      ) : shown.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No changes match the filter.{" "}
          <Button variant="link" size="xs" onClick={clearFilter}>
            Clear the filter
          </Button>
        </div>
      ) : (
        <ol
          aria-label="Changes, newest first"
          className="min-h-0 flex-1 overflow-auto"
        >
          {shown
            .slice()
            .reverse()
            .map((entry) => (
              <LogRow
                key={entry.id}
                name={name}
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
  name,
  entry,
  snapshot,
  onRestore,
}: {
  name: string;
  entry: LogEntry;
  snapshot: InspectorSnapshot;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("diff");
  const restoreDescriptionId = useId();
  const current =
    open &&
    snapshot.storeError === null &&
    deepEqual(entry.state, snapshot.store);

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
          <ToggleGroup
            aria-label={`View of log entry #${entry.id}`}
            variant="outline"
            size="xs"
            value={[view]}
            onValueChange={(next: string[]) => {
              if (next[0]) setView(next[0]);
            }}
            className="my-2 max-w-full flex-wrap"
          >
            <ToggleGroupItem value="diff">Diff</ToggleGroupItem>
            <ToggleGroupItem value="snapshot">Snapshot</ToggleGroupItem>
            <ToggleGroupItem value="compare">
              Compare with current
            </ToggleGroupItem>
          </ToggleGroup>
          {open && (
            <LogEntryView entry={entry} snapshot={snapshot} view={view} />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={current}
              onClick={onRestore}
              title={`Restore snapshot #${entry.id} to ${name}`}
              aria-describedby={restoreDescriptionId}
            >
              <History />
              {current ? "Current state" : "Restore this state"}
            </Button>
            <CopyButton
              label="Copy state"
              text={JSON.stringify(entry.state, null, 2)}
            />
          </div>
          <p
            id={restoreDescriptionId}
            className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]"
          >
            Restoring replaces the JSON state of <strong>{name}</strong>.{" "}
            {snapshot.connected === true
              ? "The connected engine syncs this change to peers."
              : snapshot.connected === false
                ? "The engine is disconnected; this changes only the local store."
                : "The store's adapter may sync to peers."}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** Compute a live comparison only while that view is open. */
function LogEntryView({
  entry,
  snapshot,
  view,
}: {
  entry: LogEntry;
  snapshot: InspectorSnapshot;
  view: string;
}) {
  const comparison = useMemo(
    () =>
      view === "compare" && snapshot.storeError === null
        ? diffJson(entry.state, snapshot.store)
        : [],
    [view, entry.state, snapshot.store, snapshot.storeError],
  );
  if (view === "snapshot")
    return <LogSnapshot entryId={entry.id} state={entry.state} />;
  if (view === "compare") {
    if (snapshot.storeError !== null)
      return (
        <p role="alert" className="text-xs text-destructive">
          Current state cannot be read as JSON: {snapshot.storeError}
        </p>
      );
    if (comparison.length === 0)
      return (
        <p className="text-xs text-muted-foreground">
          This snapshot matches the current state.
        </p>
      );
    return (
      <JsonDiff
        lines={comparison}
        label={`Snapshot #${entry.id} compared with current state`}
        beforeLabel={`snapshot #${entry.id}`}
        afterLabel="current"
      />
    );
  }
  if (entry.diff.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        No recorded changes for this entry.
      </p>
    );
  return (
    <JsonDiff
      lines={entry.diff}
      label={`Recorded diff for entry #${entry.id}`}
    />
  );
}

/** A logged state stays read-only while the live store keeps changing. */
function LogSnapshot({
  entryId,
  state,
}: {
  entryId: number;
  state: JsonObject;
}) {
  const [view, setView] = useState("tree");
  return (
    <div>
      <ToggleGroup
        aria-label={`View of snapshot #${entryId}`}
        variant="outline"
        size="xs"
        value={[view]}
        onValueChange={(next: string[]) => {
          if (next[0]) setView(next[0]);
        }}
        className="mb-2"
      >
        <ToggleGroupItem value="tree">Tree</ToggleGroupItem>
        <ToggleGroupItem value="json">JSON</ToggleGroupItem>
      </ToggleGroup>
      {view === "json" ? (
        <JsonCodeArea
          readOnly
          value={JSON.stringify(state, null, 2)}
          aria-label={`Snapshot #${entryId} as JSON`}
          className="h-64"
        />
      ) : (
        <JsonTree label={`Snapshot #${entryId}`} value={state} />
      )}
    </div>
  );
}
