import { useMemo, useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import type { Inspector, InspectorSnapshot } from "../inspector";
import {
  formatPath,
  type Json,
  type JsonObject,
  type JsonPath,
  type NonJsonValue,
} from "../json";
import { usePersistedState } from "../lib/use-persisted-state";
import { CopyButton } from "./copy-button";
import { FilterInput } from "./filter-input";
import { normalizeQuery } from "./format";
import { JsonEditor } from "./json-editor";
import { JsonTree } from "./json-tree";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Values listed in the warning; the tree marks every one. */
const LISTED_WARNINGS = 5;

export function StateTab({
  snapshot,
  inspector,
}: {
  snapshot: InspectorSnapshot;
  inspector: Inspector;
}) {
  const [stored, setView] = usePersistedState<string>("view", "tree");
  const view = stored === "json" ? "json" : "tree";
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = usePersistedState<string>("stateFilter", "");
  // A new `version` remounts the tree, so expanding or collapsing all resets what was toggled.
  const [expansion, setExpansion] = useState({ depth: 2, version: 0 });
  const expandedAll = expansion.depth === Infinity;
  const toggleAll = (): void =>
    setExpansion(({ version }) => ({
      depth: expandedAll ? 0 : Infinity,
      version: version + 1,
    }));
  const warningKinds = useMemo(
    () =>
      new Map(
        snapshot.warnings.map(({ path, kind }) => [JSON.stringify(path), kind]),
      ),
    [snapshot.warnings],
  );

  const setAt = (path: JsonPath, value: Json | undefined): void => {
    try {
      inspector.setAt(
        path,
        value,
        `${value === undefined ? "Deleted" : "Edited"} ${formatPath(path)}`,
      );
      setError(null);
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const hint =
    snapshot.connected === null
      ? "Edits go through the store's adapter."
      : snapshot.connected
        ? "Edits go through the store and sync to peers."
        : "Edits stay in this store while disconnected.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b p-1.5">
        <ToggleGroup
          aria-label="View"
          variant="outline"
          size="xs"
          value={[view]}
          onValueChange={(next: string[]) => {
            if (next[0]) setView(next[0]);
          }}
        >
          <ToggleGroupItem value="tree">Tree</ToggleGroupItem>
          <ToggleGroupItem value="json">JSON</ToggleGroupItem>
        </ToggleGroup>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {hint}
        </span>
        <CopyButton text={JSON.stringify(snapshot.store, null, 2)} />
      </div>
      {view === "tree" && (
        <div className="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-1">
          {/* On the left, in line with the tree's own chevrons. Its label names the next action. */}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={expandedAll ? "Collapse all" : "Expand all"}
            title={expandedAll ? "Collapse all" : "Expand all"}
            onClick={toggleAll}
          >
            {expandedAll ? <ChevronsDownUp /> : <ChevronsUpDown />}
          </Button>
          <FilterInput
            value={query}
            onChange={setQuery}
            label="Filter the state"
            placeholder="Filter keys and values"
          />
        </div>
      )}

      {(snapshot.storeError ?? error) && (
        <Alert variant="destructive" className="m-3 mb-0 w-auto">
          <CircleAlert />
          <AlertTitle>
            {snapshot.storeError
              ? "The store state is not JSON"
              : "The store rejected the edit"}
          </AlertTitle>
          <AlertDescription>{snapshot.storeError ?? error}</AlertDescription>
        </Alert>
      )}

      {snapshot.warnings.length > 0 && (
        <NonJsonWarning warnings={snapshot.warnings} />
      )}

      {view === "json" ? (
        <JsonEditor
          className="min-h-0 flex-1 p-3"
          label="Store state as JSON"
          requireObject
          value={snapshot.store}
          onApply={(next) =>
            inspector.replaceState(next as JsonObject, "Replaced the state")
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <JsonTree
            key={expansion.version}
            expandDepth={expansion.depth}
            filter={normalizeQuery(query)}
            label="Store state"
            value={snapshot.store}
            keyStatus={snapshot.keyStatus}
            warnings={warningKinds}
            onSet={setAt}
          />
        </div>
      )}
    </div>
  );
}

function NonJsonWarning({ warnings }: { warnings: readonly NonJsonValue[] }) {
  const count = warnings.length;
  return (
    <Alert
      role="status"
      className="m-3 mb-0 w-auto border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
    >
      <TriangleAlert />
      <AlertTitle>
        {count === 1 ? "1 value is not JSON" : `${count} values are not JSON`}
      </AlertTitle>
      <AlertDescription className="text-xs">
        Synced keys must hold plain JSON. The engine does not sync these values
        as they are, and the tree shows them as JSON would.
        <ul className="mt-1 font-mono">
          {warnings.slice(0, LISTED_WARNINGS).map(({ path, kind }) => (
            <li key={JSON.stringify(path)}>
              <span className="text-sky-700 dark:text-sky-400">
                {formatPath(path)}
              </span>{" "}
              {kind}
            </li>
          ))}
          {count > LISTED_WARNINGS && (
            <li>+{count - LISTED_WARNINGS} more, marked in the tree</li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
