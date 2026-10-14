import { useId, useState } from "react";
import { ChevronRight, CircleAlert, Database } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import type { InspectorSnapshot, KeyStatus } from "../inspector";
import { diffJson, formatPath, type Json } from "../json";
import { CopyButton } from "./copy-button";
import { JsonTree } from "./json-tree";
import { keyStatusInfo, previewOf } from "./format";
import { JsonValue, KeyStatusBadge } from "./value";

const ORDER: KeyStatus[] = [
  "diverged",
  "pending",
  "backend-only",
  "local",
  "synced",
];

/** Differences listed per diverged key until the rest are expanded. */
const DIFF_LIMIT = 10;

export function SyncTab({ snapshot }: { snapshot: InspectorSnapshot }) {
  if (snapshot.backendError !== null) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <Alert variant="destructive" className="m-3 w-auto">
          <CircleAlert />
          <AlertTitle>Backend read failed</AlertTitle>
          <AlertDescription>
            <p>{snapshot.backendError}</p>
            <p>
              Key comparisons are unavailable until the backend can be read.
            </p>
          </AlertDescription>
        </Alert>
        {snapshot.backend !== null && (
          <section>
            <h3 className="px-3 text-xs font-medium">
              Last successful backend document
            </h3>
            <JsonTree
              label="Last successful backend document"
              value={snapshot.backend}
            />
          </section>
        )}
      </div>
    );
  }
  if (snapshot.backend === null) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Database />
          </EmptyMedia>
          <EmptyTitle>No backend</EmptyTitle>
          <EmptyDescription>
            Add the <code>backend</code> this store syncs through to its source
            to compare the store with the synced document.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { store, backend } = snapshot;
  const keys = Object.entries(snapshot.keyStatus).sort(
    ([a, statusA], [b, statusB]) =>
      ORDER.indexOf(statusA) - ORDER.indexOf(statusB) || a.localeCompare(b),
  );
  const counts = new Map<KeyStatus, number>();
  for (const [, status] of keys)
    counts.set(status, (counts.get(status) ?? 0) + 1);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <section aria-labelledby="devtools-keys" className="border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 id="devtools-keys" className="text-xs font-medium">
            Keys
          </h3>
          <p className="text-xs text-muted-foreground">
            {ORDER.filter((status) => counts.has(status))
              .map(
                (status) =>
                  `${counts.get(status)} ${keyStatusInfo[status].label}`,
              )
              .join(" · ") || "The store is empty"}
          </p>
        </div>
        <ul className="mt-1.5 space-y-1">
          {keys.map(([key, status]) => (
            <li key={key} className="text-xs">
              <div className="flex items-start gap-2">
                <span className="min-w-0 shrink-0 truncate font-mono text-sky-700 dark:text-sky-400">
                  {key}
                </span>
                <KeyStatusBadge status={status} />
                {status !== "synced" && (
                  <span className="min-w-0 text-muted-foreground">
                    {keyStatusInfo[status].hint}
                  </span>
                )}
              </div>
              {status === "diverged" && (
                <Divergence
                  name={key}
                  store={store[key]}
                  backend={backend[key]}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="devtools-backend">
        <div className="flex items-center gap-2 px-3 pt-2">
          <h3 id="devtools-backend" className="text-xs font-medium">
            Backend document
          </h3>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            Read-only; edit the store and the engine writes here.
          </span>
          <CopyButton text={JSON.stringify(snapshot.backend, null, 2)} />
        </div>
        <JsonTree label="Backend document" value={snapshot.backend} />
      </section>
    </div>
  );
}

/** Where a diverged key's value in the store differs from the backend's, path by path. */
function Divergence({
  name,
  store,
  backend,
}: {
  name: string;
  store: Json | undefined;
  backend: Json | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowsId = useId();
  const lines = diffJson(
    backend === undefined ? {} : { [name]: backend },
    store === undefined ? {} : { [name]: store },
  );
  const shown = expanded ? lines : lines.slice(0, DIFF_LIMIT);
  // Array edits can touch the same path more than once. Distinguish those occurrences
  // while preserving inspected paths when earlier differences are added or removed.
  const occurrences = new Map<string, number>();

  return (
    <table
      aria-label={`${name} in the store and the backend`}
      className="mt-1 mb-1.5 w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-0.5 font-mono"
    >
      <thead className="text-[10px] text-muted-foreground">
        <tr>
          <th scope="col">
            <span className="sr-only">Path</span>
          </th>
          <th scope="col" className="text-left font-normal">
            store
          </th>
          <th scope="col" className="text-left font-normal">
            backend
          </th>
        </tr>
      </thead>
      <tbody id={rowsId} className="align-baseline">
        {shown.map((line) => {
          const path = formatPath(line.path);
          const identity = JSON.stringify([line.path, line.kind]);
          const occurrence = occurrences.get(identity) ?? 0;
          occurrences.set(identity, occurrence + 1);
          return (
            <tr key={`${identity}:${occurrence}`}>
              <th
                scope="row"
                className="text-left font-normal text-sky-700 dark:text-sky-400"
              >
                <div className="flex items-start gap-0.5">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {path}
                  </span>
                  <CopyButton
                    iconOnly
                    text={path}
                    label={`Copy path ${path}`}
                  />
                </div>
              </th>
              <td>
                <Side
                  label={`store value at ${path}`}
                  value={line.after}
                  present={line.kind !== "delete"}
                />
              </td>
              <td>
                <Side
                  label={`backend value at ${path}`}
                  value={line.before}
                  present={line.kind !== "insert"}
                />
              </td>
            </tr>
          );
        })}
        {lines.length > DIFF_LIMIT && (
          <tr>
            <td colSpan={3} className="text-muted-foreground">
              <Button
                size="xs"
                variant="link"
                aria-expanded={expanded}
                aria-controls={rowsId}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? `Show first ${DIFF_LIMIT} differences`
                  : `Show all ${lines.length} differences`}
              </Button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Side({
  value,
  present,
  label,
}: {
  value: Json | undefined;
  present: boolean;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  if (!present || value === undefined)
    return <span className="text-muted-foreground">not set</span>;

  const text = JSON.stringify(value, null, 2);
  const expandable = previewOf(value) !== JSON.stringify(value);

  return (
    <div className="min-w-0">
      <div className="flex items-start gap-0.5">
        {expandable ? (
          <button
            type="button"
            aria-label={`Inspect ${label}`}
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            title={expanded ? "Hide full value" : "Show full value"}
            onClick={() => setExpanded(!expanded)}
            className="flex min-w-0 flex-1 items-start gap-0.5 rounded py-0.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "mt-0.5 size-3 shrink-0 transition-transform",
                expanded && "rotate-90",
              )}
            />
            <JsonValue value={value} />
          </button>
        ) : (
          <JsonValue value={value} className="min-w-0 flex-1 py-0.5" />
        )}
        <CopyButton iconOnly text={text} label={`Copy ${label}`} />
      </div>
      {expandable && expanded && (
        <pre
          id={detailsId}
          role="region"
          aria-label={`Full ${label}`}
          tabIndex={0}
          className="mt-1 max-h-64 overflow-auto rounded border bg-muted/40 p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}
