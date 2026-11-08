import * as A from "@automerge/automerge";
import type { ApplyOps, TextPolicy } from "@homeostate/core";

export type Container = Record<string, unknown>;

type Path = readonly A.Prop[];

export const isRecord = (value: unknown): value is Container =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Returns `value` at `path` as it is assigned in `A.change`: strings the policy marks as text
 * stay plain strings, which Automerge stores as text, and every other string becomes an
 * `ImmutableString`.
 */
export const toAutomerge = (
  value: unknown,
  path: Path,
  text: TextPolicy,
): unknown => {
  if (typeof value === "string")
    return text(path) ? value : new A.ImmutableString(value);
  if (Array.isArray(value))
    return value.map((item, i) => toAutomerge(item, [...path, i], text));
  if (isRecord(value)) {
    const copy: Container = {};
    for (const [key, item] of Object.entries(value))
      copy[key] = toAutomerge(item, [...path, key], text);
    return copy;
  }
  return value;
};

/**
 * How `applyChanges` writes into `doc[root]` inside `A.change`. Every value it writes is
 * converted by `toAutomerge`. Text reads as a string and is edited character by character
 * through its object ID, found from its path; an `ImmutableString`, held by a peer
 * with another policy or an older version, is a plain value and is replaced whole. Paths given to
 * the policy start below `root`.
 */
export const createAutomergeOps = (
  doc: Container,
  root: string,
  text: TextPolicy,
): ApplyOps => ({
  kind: (value) => {
    if (typeof value === "string") return "text";
    if (Array.isArray(value)) return "list";
    // A list proxy claims every property, so `isImmutableString` alone accepts one.
    return isRecord(value) && !A.isImmutableString(value)
      ? "record"
      : undefined;
  },

  get: (container, key) => (container as Container)[key],

  set: (container, key, value, path) => {
    (container as Container)[key] = toAutomerge(value, [...path, key], text);
  },

  remove: (container, key) => {
    delete (container as Container)[key];
  },

  splice: (list, index, deleteCount, inserted, path) => {
    if (deleteCount > 0) A.deleteAt(list as unknown[], index, deleteCount);
    if (inserted.length > 0)
      A.insertAt(
        list as unknown[],
        index,
        ...inserted.map((value, i) =>
          toAutomerge(value, [...path, index + i], text),
        ),
      );
  },

  editText: (_text, index, deleteCount, inserted, path) => {
    const backend = A.getBackend(doc);
    const { parent, id } = findText(backend, doc, root, path);
    if (inserted.length > 0) backend.splice(id, index, deleteCount, inserted);
    else backend.splice(id, index, deleteCount);
    // As `A.splice` does, or the parent proxy reads the text as it was until the change ends.
    Reflect.set(parent, CLEAR_CACHE, true);
  },
});

/** Tells an Automerge map proxy to drop the values it read; a list proxy keeps none. */
const CLEAR_CACHE = Symbol.for("_am_clearCache");

/**
 * The text at `path` below `doc[root]`: the proxy of its parent, reached by walking the proxies,
 * which take any key, and its object ID, which the parent's entry holds.
 *
 * Automerge's own functions miss some keys, which is why the ID comes from the document's
 * backend, although `A.getBackend` is marked hidden. `A.splice` joins its path with "/" for the
 * Wasm side to split again, so a key that is empty or holds "/", the synced key name among
 * them, addresses another object or none. `A.getObjectId(parent, key)` returns the parent's own
 * ID for a falsy key, `""` or index `0`.
 */
const findText = (
  backend: ReturnType<typeof A.getBackend>,
  doc: Container,
  root: string,
  path: Path,
): { parent: object; id: A.ObjID } => {
  const parent = path
    .slice(0, -1)
    .reduce<unknown>(
      (container, key) => (container as Record<A.Prop, unknown>)[key],
      doc[root],
    ) as object;
  const parentId = A.getObjectId(parent);
  const entry =
    parentId === null ? null : backend.getWithType(parentId, path.at(-1)!);
  if (entry?.[0] !== "text")
    throw new RangeError(
      `No Automerge text at ${JSON.stringify([root, ...path])}`,
    );
  return { parent, id: entry[1] };
};
