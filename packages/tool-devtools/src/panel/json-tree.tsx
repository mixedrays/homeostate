import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  createTypeahead,
  followFocus,
  initRovingTabindex,
  keyRove,
  matchesCombo,
  toggleTabIndex,
  type GroupOptions,
} from "@mixedrays/keyrove";
import { Braces, ChevronRight, Trash2 } from "lucide-react";
import { jsonEqual } from "@homeostate/core";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { KeyStatus } from "../inspector";
import { formatPath, type Json, type JsonObject, type JsonPath } from "../json";
import { JsonEditor } from "./json-editor";
import { keyStatusInfo, previewOf } from "./format";
import { KeyStatusBadge, JsonValue, NonJsonBadge } from "./value";

/** Children shown before a "show all" button, so a long array does not stall the panel. */
const CHILD_LIMIT = 100;

/**
 * keyrove's reading of the tree: the rows are its items, with one tab stop between them.
 * Up and Down, Home and End and the page keys move between the rows on screen; a closed
 * container's rows are not rendered, so there is nothing to skip. Left and Right are left
 * to the rows, which open and close containers.
 */
const NAVIGATION: GroupOptions = {
  items: '[role="treeitem"]',
  rovingTabindex: true,
  orientation: "vertical",
};

const activeElementOf = (element: Element): Element | null =>
  (element.getRootNode() as Document | ShadowRoot).activeElement;

const holdsFocus = (element: Element): boolean => {
  const active = activeElementOf(element);
  return active !== null && element.contains(active);
};

/** Moves focus and the tab stop from one row to another, as keyrove's own moves do. */
const moveTo = (from: Element, to: Element | null | undefined): boolean => {
  if (!(to instanceof HTMLElement)) return false;
  toggleTabIndex({ root: from, isActive: false });
  toggleTabIndex({ root: to, isActive: true });
  to.focus();
  return true;
};

const parentRow = (row: Element): Element | null | undefined =>
  row.closest('[role="group"]')?.previousElementSibling;

/** The first row of an open container's group, which its row names with `aria-owns`. */
const firstChildRow = (row: Element): Element | null | undefined => {
  const id = row.getAttribute("aria-owns");
  const root = row.getRootNode() as Document | ShadowRoot;
  return id
    ? root.getElementById(id)?.querySelector('[role="treeitem"]')
    : null;
};

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
  /** Shows only what matches, with the containers on the way to it open. */
  filter?: string;
}

interface TreeState {
  onSet?: (path: JsonPath, value: Json | undefined) => void;
  keyStatus?: Readonly<Record<string, KeyStatus>>;
  warnings?: ReadonlyMap<string, string>;
  expandDepth: number;
  /** With a filter: the nodes that match, everything under them shows. */
  hits: ReadonlySet<string> | null;
  /** With a filter: the containers on the way to a match, which show open. */
  forced: ReadonlySet<string> | null;
  toggled: ReadonlySet<string>;
  toggle: (id: string) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  /** Deletes the value at `path`, keeping focus in the tree if its row goes. */
  remove: (row: HTMLElement, path: JsonPath) => void;
}

const isContainer = (value: Json): value is Json[] | JsonObject =>
  value !== null && typeof value === "object";

const entriesOf = (value: Json[] | JsonObject): [string | number, Json][] =>
  Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);

/** What `filter` matches in `value`: a path, or a value that is not a container. */
const filterTree = (
  value: JsonObject,
  filter: string,
): { hits: Set<string>; forced: Set<string> } => {
  const hits = new Set<string>();
  const forced = new Set<string>();
  const walk = (node: Json, path: JsonPath): boolean => {
    const id = JSON.stringify(path);
    if (
      formatPath(path).toLowerCase().includes(filter) ||
      (!isContainer(node) && String(node).toLowerCase().includes(filter))
    ) {
      hits.add(id);
      return true;
    }
    if (!isContainer(node)) return false;
    let found = false;
    for (const [key, child] of entriesOf(node))
      if (walk(child, [...path, key])) found = true;
    if (found) forced.add(id);
    return found;
  };
  for (const [key, child] of Object.entries(value)) walk(child, [key]);
  return { hits, forced };
};

/** Whether the node at `path` shows: with no filter, or under a match, every node does. */
const shows = (tree: TreeState, path: JsonPath, underHit: boolean): boolean => {
  if (!tree.hits || underHit) return true;
  const id = JSON.stringify(path);
  return tree.hits.has(id) || (tree.forced?.has(id) ?? false);
};

/**
 * The state as an expandable tree. With `onSet`, clicking a value edits it in place
 * (booleans toggle), a container can be edited as JSON, and keys and items can be deleted.
 *
 * It is one tab stop, navigated with keyrove as the APG tree view: Up and Down move between
 * rows, Right opens a container or enters it, Left closes it or goes to its parent, and
 * typing a key's name jumps to it. With `onSet`, Enter edits the row's value, toggles a
 * boolean or edits a container as JSON, and Delete or Backspace deletes it.
 */
export function JsonTree({
  value,
  label,
  onSet,
  keyStatus,
  warnings,
  expandDepth = 2,
  filter = "",
}: JsonTreeProps) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const root = useRef<HTMLUListElement>(null);
  const [typeahead] = useState(() => createTypeahead(NAVIGATION));
  // The position of a deleted row, to put focus back on whatever takes its place.
  const removed = useRef<number | null>(null);

  // keyrove moves the tab stop but never places one: after every render, one row holds it.
  useLayoutEffect(() => {
    const tree = root.current;
    if (!tree) return;
    const index = removed.current;
    if (index !== null && !holdsFocus(tree)) {
      removed.current = null;
      const rows = tree.querySelectorAll('[role="treeitem"]');
      const next = rows[Math.min(index, rows.length - 1)];
      initRovingTabindex(tree, { ...NAVIGATION, initial: next });
      if (next instanceof HTMLElement) next.focus();
    } else initRovingTabindex(tree, NAVIGATION);
  });
  const matched = useMemo(
    () => (filter === "" ? null : filterTree(value, filter.toLowerCase())),
    [value, filter],
  );

  const tree: TreeState = {
    onSet,
    keyStatus,
    warnings,
    expandDepth,
    hits: matched?.hits ?? null,
    forced: matched?.forced ?? null,
    toggled,
    toggle: (id) =>
      setToggled((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    editing,
    setEditing,
    remove: (row, path) => {
      const rows = [
        ...(root.current?.querySelectorAll('[role="treeitem"]') ?? []),
      ];
      removed.current = rows.indexOf(row);
      onSet?.(path, undefined);
    },
  };

  const entries = entriesOf(value).filter(([key]) => shows(tree, [key], false));

  return (
    <ul
      ref={root}
      role="tree"
      aria-label={label}
      onKeyDown={(event) => {
        // The row's own keys run first, and a key they take is passed over here.
        if (keyRove(event, NAVIGATION) || typeahead(event))
          removed.current = null;
      }}
      onFocus={(event) => followFocus(event, NAVIGATION)}
      className="py-1 font-mono text-xs"
    >
      {entries.length === 0 && (
        <li role="none" className="px-3 py-1 text-muted-foreground">
          {matched ? "Nothing matches the filter" : "Empty object"}
        </li>
      )}
      {entries.map(([key, child]) => (
        <TreeNode
          key={key}
          name={key}
          value={child}
          path={[key]}
          depth={0}
          underHit={false}
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
  /** Whether a filter matched this node or one above it, so all of it shows. */
  underHit: boolean;
  tree: TreeState;
}

function TreeNode({ name, value, path, depth, underHit, tree }: TreeNodeProps) {
  const id = JSON.stringify(path);
  const jsonId = `${id}:json`;
  const container = isContainer(value);
  const editingJson = tree.editing === jsonId;
  // On the way to a filter's match, but not a match: open, showing only what leads there.
  const forced = !underHit && (tree.forced?.has(id) ?? false);
  const childrenUnderHit = underHit || (tree.hits?.has(id) ?? false);
  const open =
    container &&
    (editingJson ||
      forced ||
      depth < tree.expandDepth !== tree.toggled.has(id));
  const status = depth === 0 ? tree.keyStatus?.[String(name)] : undefined;
  const nonJson = tree.warnings?.get(id);
  const where = formatPath(path);
  const indent = { paddingLeft: `${depth * 14 + 4}px` };
  const item = useRef<HTMLLIElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const groupId = useId();
  const editingHere = tree.editing === id || tree.editing === jsonId;
  // Set when an edit ends with focus in it, so the row takes focus back.
  const refocus = useRef(false);

  useLayoutEffect(() => {
    if (!refocus.current || editingHere) return;
    refocus.current = false;
    row.current?.focus();
  });

  const stopEditing = (): void => {
    refocus.current = item.current ? holdsFocus(item.current) : false;
    tree.setEditing(null);
  };

  const set = tree.onSet;
  let display: ReactNode;
  if (tree.editing === id && set) {
    display = (
      <ValueInput
        value={value}
        label={`Value of ${where}`}
        onCommit={(next) => {
          stopEditing();
          set(path, next);
        }}
        onCancel={stopEditing}
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
        tabIndex={-1}
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

  const children = container
    ? entriesOf(value).filter(([key]) =>
        shows(tree, [...path, key], childrenUnderHit),
      )
    : [];
  const showAll = tree.toggled.has(`${id}:all`);
  const shown = showAll ? children : children.slice(0, CHILD_LIMIT);
  const grouped = open && !editingJson;

  // The APG tree's keys that need the tree's shape; keyrove has the rest.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Keys pressed in the row's input or buttons are theirs.
    if (event.target !== event.currentTarget) return;
    const self = event.currentTarget;
    if (matchesCombo(event, "ArrowRight")) {
      if (!container) return;
      if (!open) tree.toggle(id);
      else if (!moveTo(self, firstChildRow(self))) return;
    } else if (matchesCombo(event, "ArrowLeft")) {
      if (open && !forced && !editingJson) tree.toggle(id);
      else if (!moveTo(self, parentRow(self))) return;
    } else if (matchesCombo(event, "Enter")) {
      if (!set) {
        if (!container || forced) return;
        tree.toggle(id);
      } else if (typeof value === "boolean") set(path, !value);
      else tree.setEditing(container ? jsonId : id);
    } else if (set && matchesCombo(event, "Delete, Backspace")) {
      tree.remove(self, path);
    } else return;
    event.preventDefault();
  };

  return (
    <li ref={item} role="none">
      <div
        ref={row}
        role="treeitem"
        tabIndex={-1}
        aria-label={[
          `${name}: ${previewOf(value)}`,
          status && keyStatusInfo[status].label,
          nonJson && `not JSON, ${nonJson}`,
        ]
          .filter(Boolean)
          .join(", ")}
        aria-expanded={container ? open : undefined}
        aria-owns={grouped ? groupId : undefined}
        data-keyrove-typeahead={String(name)}
        onKeyDown={onKeyDown}
        className="group flex min-h-6 items-center gap-1 pr-2 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        style={indent}
      >
        {container ? (
          <button
            type="button"
            tabIndex={-1}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${where}`}
            disabled={forced}
            title={forced ? "Open while the filter matches inside" : undefined}
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
                tabIndex={-1}
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
              tabIndex={-1}
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
            autoFocus
            value={value}
            label={`${where} as JSON`}
            onApply={(next) => {
              set(path, next);
              stopEditing();
            }}
            onCancel={stopEditing}
          />
        </div>
      )}

      {grouped && (
        <ul id={groupId} role="group">
          {children.length === 0 && (
            <li
              role="none"
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
              underHit={childrenUnderHit}
              tree={tree}
            />
          ))}
          {shown.length < children.length && (
            <li
              role="none"
              style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}
            >
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
  const [base, setBase] = useState(value);
  const isString = typeof base === "string";
  const [text, setText] = useState(() =>
    typeof value === "string" ? value : JSON.stringify(value),
  );
  const initialText = isString ? base : JSON.stringify(base);
  const dirty = text !== initialText;
  const stale = !jsonEqual(value, base);
  const warningId = useId();
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
    if (!dirty || parsed.value === value) onCancel();
    else if (!stale) onCommit(parsed.value);
  };

  return (
    <div className="min-w-0 flex-1">
      <Input
        autoFocus
        value={text}
        aria-label={label}
        aria-invalid={!parsed.ok || undefined}
        aria-describedby={dirty && stale ? warningId : undefined}
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
      {dirty && stale && (
        <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          <p id={warningId} role="status">
            The value changed since you started editing.
          </p>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setBase(value);
              setText(
                typeof value === "string" ? value : JSON.stringify(value),
              );
            }}
          >
            Load latest
          </Button>
          <Button size="xs" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
