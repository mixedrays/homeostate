import { Database } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import type { InspectorSnapshot, KeyStatus } from "../inspector";
import { CopyButton } from "./copy-button";
import { JsonTree } from "./json-tree";
import { keyStatusInfo } from "./format";
import { KeyStatusBadge } from "./value";

const ORDER: KeyStatus[] = [
  "diverged",
  "pending",
  "backend-only",
  "local",
  "synced",
];

export function SyncTab({ snapshot }: { snapshot: InspectorSnapshot }) {
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
            <li key={key} className="flex items-start gap-2 text-xs">
              <span className="min-w-0 shrink-0 truncate font-mono text-sky-700 dark:text-sky-400">
                {key}
              </span>
              <KeyStatusBadge status={status} />
              {status !== "synced" && (
                <span className="min-w-0 text-muted-foreground">
                  {keyStatusInfo[status].hint}
                </span>
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
