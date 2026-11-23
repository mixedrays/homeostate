import * as A from "@automerge/automerge";
import type { ApplyOps, TextPolicy } from "@homeostate/core";

export type Container = Record<string, unknown>;

type Path = readonly A.Prop[];

export const isRecord = (value: unknown): value is Container =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Whether Automerge, given `value`, stores a 64-bit integer that it reads back as a `bigint`, or
 * clamps. It stores every integer as one, and reads those from `Number.MAX_SAFE_INTEGER` up, and
 * below its negation, as `bigint`s.
 */
const isLargeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Math.abs(value) >= Number.MAX_SAFE_INTEGER;

/** Large integers that `convert` left as `null`, by their path from where it is written. */
type Deferred = [at: A.Prop[], value: number][];

/**
 * Returns `value` at `path` as it is assigned in `A.change`: strings the policy marks as text
 * stay plain strings, which Automerge stores as text, and every other string becomes an
 * `ImmutableString`. A large integer becomes `null`, and goes to `deferred` with `at`, its path
 * from where the result is written.
 */
const convert = (
  value: unknown,
  path: Path,
  text: TextPolicy | undefined,
  at: A.Prop[],
  deferred: Deferred,
): unknown => {
  if (typeof value === "string")
    return text?.(path) === true ? value : new A.ImmutableString(value);
  if (isLargeInteger(value)) {
    deferred.push([at, value]);
    return null;
  }
  if (Array.isArray(value))
    return value.map((item, i) =>
      convert(item, [...path, i], text, [...at, i], deferred),
    );
  if (isRecord(value)) {
    const copy: Container = {};
    for (const [key, item] of Object.entries(value))
      copy[key] = convert(item, [...path, key], text, [...at, key], deferred);
    return copy;
  }
  return value;
};

/**
 * Sets each deferred integer below `target`, a proxy, as a `Float64`, over its `null`. Automerge
 * 3.4.1 stores a `Float64` inside an assigned object or array, or one given to `A.insertAt`, as
 * a map holding its `value`; only a proxy's own assignment stores it as a number.
 */
const putDeferred = (target: object, deferred: Deferred): void => {
  for (const [at, value] of deferred) {
    const parent = at
      .slice(0, -1)
      .reduce<unknown>(
        (container, key) => (container as Record<A.Prop, unknown>)[key],
        target,
      ) as Record<A.Prop, unknown>;
    parent[at.at(-1)!] = new A.Float64(value);
  }
};

/**
 * Inside `A.change`, assigns `value`, at `path`, to `key` of `container`, a map or list proxy.
 * Strings the policy marks as text are stored as text, and every other string as an
 * `ImmutableString`.
 * Large integers are stored as `Float64`s, which read back as the numbers written: Automerge
 * would read them as `bigint`s, or clamp those outside the 64-bit range.
 */
export const assign = (
  container: object,
  key: A.Prop,
  value: unknown,
  path: Path,
  text: TextPolicy | undefined,
): void => {
  const target = container as Record<A.Prop, unknown>;
  if (isLargeInteger(value)) {
    target[key] = new A.Float64(value);
    return;
  }
  const deferred: Deferred = [];
  target[key] = convert(value, path, text, [key], deferred);
  putDeferred(container, deferred);
};

/**
 * Increments `counter`, a counter proxy inside `A.change`, so that it holds `next`, and says
 * whether it could: only when `next` is an integer that reads back as a number, and the delta a
 * safe integer. Automerge truncates a fractional delta and wraps one beyond the 64-bit range.
 */
const incrementTo = (counter: A.Counter, next: unknown): boolean => {
  // A `bigint` from `Number.MAX_SAFE_INTEGER` up, which `increment` can't add a number to.
  const current: unknown = counter.value;
  if (typeof current !== "number" || typeof next !== "number") return false;
  if (!Number.isInteger(next) || isLargeInteger(next)) return false;
  const delta = next - current;
  if (!Number.isSafeInteger(delta)) return false;
  if (delta !== 0) counter.increment(delta);
  return true;
};

/**
 * How `applyChanges` writes into `doc[root]` inside `A.change`. Every value it writes is
 * stored as `assign` stores it. Text reads as a string and is edited character by character
 * through its object ID, found from its path; an `ImmutableString`, held by a peer
 * with another policy or an older version, is a plain value and is replaced whole. Paths given to
 * the policy start below `root`; without one, no string is text.
 *
 * A `Counter` other code stored is a plain value too, read as its number. A write over one
 * increments it by the difference when `incrementTo` can, so concurrent increments of it merge,
 * and otherwise replaces it.
 */
export const createAutomergeOps = (
  doc: Container,
  root: string,
  text?: TextPolicy,
): ApplyOps => ({
  kind: (value) => {
    if (typeof value === "string") return "text";
    if (Array.isArray(value)) return "list";
    // A list proxy claims every property, so `isImmutableString` or `isCounter` alone accepts one.
    return isRecord(value) && !A.isImmutableString(value) && !A.isCounter(value)
      ? "record"
      : undefined;
  },

  get: (container, key) => (container as Container)[key],

  set: (container, key, value, path) => {
    const current = (container as Container)[key];
    // A list proxy claims every property, so `isCounter` alone accepts one.
    if (
      !Array.isArray(current) &&
      A.isCounter(current) &&
      incrementTo(current, value)
    )
      return;
    assign(container, key, value, [...path, key], text);
  },

  remove: (container, key) => {
    delete (container as Container)[key];
  },

  splice: (list, index, deleteCount, inserted, path) => {
    if (deleteCount > 0) A.deleteAt(list as unknown[], index, deleteCount);
    if (inserted.length === 0) return;
    const deferred: Deferred = [];
    A.insertAt(
      list as unknown[],
      index,
      ...inserted.map((value, i) =>
        convert(value, [...path, index + i], text, [index + i], deferred),
      ),
    );
    putDeferred(list, deferred);
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
