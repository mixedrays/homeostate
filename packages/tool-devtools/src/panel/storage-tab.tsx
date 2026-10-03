import { useEffect } from "react";
import { CircleAlert, FoldVertical, HardDrive, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import type { Inspector, InspectorSnapshot } from "../inspector";
import { formatBytes } from "./format";

export function StorageTab({
  snapshot,
  inspector,
}: {
  snapshot: InspectorSnapshot;
  inspector: Inspector;
}) {
  const { storage } = snapshot;

  // Read again whenever the state changes: the change has most likely been stored.
  useEffect(() => {
    void inspector.refreshStorage();
  }, [inspector, snapshot.store, snapshot.backend]);

  if (storage === null) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HardDrive />
          </EmptyMedia>
          <EmptyTitle>No persistence</EmptyTitle>
          <EmptyDescription>
            Add what <code>createPersistence</code> returned to the source as{" "}
            <code>persistence</code> to see what is stored.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { stats, busy, cleared, error } = storage;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
        <Button
          size="xs"
          variant="outline"
          disabled={busy !== null || cleared}
          onClick={() => void inspector.compactStorage()}
          title="Merge the stored updates into one snapshot"
        >
          <FoldVertical />
          {busy === "compacting" ? "Compacting…" : "Compact"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void inspector.clearStorage()}
          title="Remove the stored document and stop storing it until the page reloads"
          className="hover:text-destructive"
        >
          <Trash2 />
          {busy === "clearing" ? "Clearing…" : "Clear"}
        </Button>
      </div>

      {cleared && (
        <p
          role="status"
          className="border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
        >
          Cleared: this page no longer stores the document, until it reloads.
          Other tabs that store the same key may write it again.
        </p>
      )}

      {error && (
        <Alert variant="destructive" className="m-3 mb-0 w-auto">
          <CircleAlert />
          <AlertTitle>Storage failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="devtools-stored" className="px-3 py-2">
        <h3 id="devtools-stored" className="text-xs font-medium">
          Stored document
        </h3>
        {stats === null ? (
          <p className="mt-1.5 text-xs text-muted-foreground">Reading…</p>
        ) : (
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Updates</dt>
            <dd className="font-mono tabular-nums">{stats.updates}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="font-mono tabular-nums">
              {formatBytes(stats.bytes)}
            </dd>
          </dl>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          The document is stored as a log of updates. Loading it, and every{" "}
          <code>compactAfter</code> updates, merges the log into one snapshot;
          Compact does it now. Clear removes the stored document, while the live
          document and its peers keep their state.
        </p>
      </section>
    </div>
  );
}
