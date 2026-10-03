import { useMemo, useState, type ReactNode } from "react";
import { Braces, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { KeyStatus } from "../inspector";
import { formatPath, type Json, type JsonObject, type JsonPath } from "../json";
import { JsonEditor } from "./json-editor";
import { previewOf } from "./format";
import { KeyStatusBadge, JsonValue, NonJsonBadge } from "./value";

/** Children shown before a "show all" button, so a long array does not stall the panel. */
const CHILD_LIMIT = 100;

interface JsonTreeProps {
  value: JsonObject;
  label: string;
  /** Makes values editable; `undefined` deletes. */
  onSet?: (path: JsonPath, value: Json | undefined) => void;
  /** Badges on the top-level keys. */
  keyStatus?: Readonly<Record<string, KeyStatus>>;
  /** What each value that is not JSON really is, by `JSON.stringify(path)`. */
  warnings?: ReadonlyMap<string, string>;
  /** Containers shallower than this start expanded. */
  expandDepth?: number;
}

interface TreeState {
  onSet?: (path: JsonPath, value: Json | undefined) => void;
  keyStatus?: Readonly<Record<string, KeyStatus>>;
  warnings?: ReadonlyMap<string, string>;
  expandDepth: number;
  toggled: ReadonlySet<string>;
  toggle: (id: string) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
}

const isContainer = (value: Json): value is Json[] | JsonObject =>
  value !== null && typeof value === "object";

const entriesOf = (value: Json[] | JsonObject): [string | number, Json][] =>
  Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);

/**
 * The state as an expandable tree. With `onSet`, clicking a value edits it in place
 * (booleans toggle), a container can be edited as JSON, and keys and items can be deleted.
 */
export function JsonTree({
  value,
  label,
  onSet,
  keyStatus,
  warnings,
  expandDepth = 2,
}: JsonTreeProps) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const tree: TreeState = {
    onSet,
    keyStatus,
    warnings,
    expandDepth,
    toggled,
    toggle: (id) =>
      setToggled((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    editing,
    setEditing,
  };

  const entries = entriesOf(value);

  return (
    <ul aria-label={label} className="py-1 font-mono text-xs">
      {entries.length === 0 && (
        <li className="px-3 py-1 text-muted-foreground">Empty object</li>
      )}
      {entries.map(([key, child]) => (
        <TreeNode
          key={key}
          name={key}
          value={child}
          path={[key]}
          depth={0}
          tree={tree}
        />
      ))}
    </ul>
  );
}

interface TreeNodeProps {
  name: string | number;
  value: Json;
  path: JsonPath;
  depth: number;
  tree: TreeState;
}

function TreeNode({ name, value, path, depth, tree }: TreeNodeProps) {
  const id = JSON.stringify(path);
  const jsonId = `${id}:json`;
  const container = isContainer(value);
  const editingJson = tree.editing === jsonId;
  const open =
    container &&
    (editingJson || depth < tree.expandDepth !== tree.toggled.has(id));
  const status = depth === 0 ? tree.keyStatus?.[String(name)] : undefined;
  const nonJson = tree.warnings?.get(id);
  const where = formatPath(path);
  const indent = { paddingLeft: `${depth * 14 + 4}px` };

  const set = tree.onSet;
  let display: ReactNode;
  if (tree.editing === id && set) {
    display = (
      <ValueInput
        value={value}
        label={`Value of ${where}`}
        onCommit={(next) => {
          tree.setEditing(null);
          set(path, next);
        }}
        onCancel={() => tree.setEditing(null)}
      />
    );
  } else if (container) {
    display = (
      <button
        type="button"
        onClick={() => tree.toggle(id)}
        className="min-w-0 truncate text-left text-muted-foreground"
        tabIndex={-1}
      >
        {previewOf(value)}
      </button>
    );
  } else if (set) {
    const toggles = typeof value === "boolean";
    display = (
      <button
        type="button"
        title={toggles ? "Click to toggle" : "Click to edit"}
        aria-label={`${toggles ? "Toggle" : "Edit"} ${where}`}
        onClick={() => (toggles ? set(path, !value) : tree.setEditing(id))}
        className="min-w-0 rounded px-0.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <JsonValue value={value} />
      </button>
    );
  } else {
    display = <JsonValue value={value} className="px-0.5" />;
  }

  const children = container ? entriesOf(value) : [];
  const showAll = tree.toggled.has(`${id}:all`);
  const shown = showAll ? children : children.slice(0, CHILD_LIMIT);

  return (
    <li>
      <div
        className="group flex min-h-6 items-center gap-1 pr-2 hover:bg-muted/60"
        style={indent}
      >
        {container ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${where}`}
            onClick={() => tree.toggle(id)}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight
              className={cn("size-3 transition-transform", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span
          className={cn(
            "shrink-0",
            typeof name === "number"
              ? "text-muted-foreground"
              : "text-sky-700 dark:text-sky-400",
          )}
        >
          {name}
        </span>
        <span className="shrink-0 text-muted-foreground">:</span>
        {display}
        {nonJson && <NonJsonBadge kind={nonJson} />}
        {status && <KeyStatusBadge status={status} />}
        {set && tree.editing !== id && (
          <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            {container && (
              <Button
                variant="ghost"
                size="icon-xs"
                title="Edit as JSON"
                aria-label={`Edit ${where} as JSON`}
                onClick={() => tree.setEditing(editingJson ? null : jsonId)}
              >
                <Braces />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete"
              aria-label={`Delete ${where}`}
              onClick={() => set(path, undefined)}
              className="hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </span>
        )}
      </div>

      {open && editingJson && set && (
        <div
          className="py-1 pr-2"
          style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}
        >
          <JsonEditor
            className="h-56"
            value={value}
            label={`${where} as JSON`}
            onApply={(next) => {
              set(path, next);
              tree.setEditing(null);
            }}
            onCancel={() => tree.setEditing(null)}
          />
        </div>
      )}

      {open && !editingJson && (
        <ul>
          {children.length === 0 && (
            <li
              className="min-h-6 text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}
            >
              {Array.isArray(value) ? "Empty array" : "Empty object"}
            </li>
          )}
          {shown.map(([key, child]) => (
            <TreeNode
              key={key}
              name={key}
              value={child}
              path={[...path, key]}
              depth={depth + 1}
              tree={tree}
            />
          ))}
          {shown.length < children.length && (
            <li style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}>
              <Button
                variant="link"
                size="xs"
                onClick={() => tree.toggle(`${id}:all`)}
              >
                Show all {children.length}
              </Button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

type ParsedValue = { ok: true; value: Json } | { ok: false };

/**
 * A string is edited as text and stays a string; any other value is edited as JSON,
 * so `5` stays a number and `"5"` becomes a string.
 */
function ValueInput({
  value,
  label,
  onCommit,
  onCancel,
}: {
  value: Json;
  label: string;
  onCommit: (value: Json) => void;
  onCancel: () => void;
}) {
  const isString = typeof value === "string";
  const [text, setText] = useState(() =>
    isString ? value : JSON.stringify(value),
  );
  const parsed = useMemo((): ParsedValue => {
    if (isString) return { ok: true, value: text };
    try {
      return { ok: true, value: JSON.parse(text) as Json };
    } catch {
      return { ok: false };
    }
  }, [isString, text]);

  const commit = (): void => {
    if (!parsed.ok) return;
    if (parsed.value === value) onCancel();
    else onCommit(parsed.value);
  };

  return (
    <Input
      autoFocus
      value={text}
      aria-label={label}
      aria-invalid={!parsed.ok || undefined}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          // Keep Escape from closing the panel.
          event.stopPropagation();
          onCancel();
        }
      }}
      onBlur={() => (parsed.ok ? commit() : onCancel())}
      className="h-6 min-w-0 flex-1 rounded-sm px-1 py-0 font-mono text-xs md:text-xs"
    />
  );
}
