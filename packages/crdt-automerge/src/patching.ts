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
 * Returns `value` at `path` as assigned in `A.change`: text stays a string, any other string
 * becomes an `ImmutableString`, and a large integer becomes `null`, pushed to `deferred` at `at`.
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
 * Inside `A.change`, assigns `value` to `key` of the proxy `container`, converted as `convert`
 * does. Large integers go in as `Float64`s; Automerge would read them back as `bigint`s or clamp.
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
 * How `applyChanges` writes into `doc[root]` inside `A.change`, storing values as `assign` does.
 * `ImmutableString`s and `Counter`s are plain values; a write over a `Counter` increments it when
 * `incrementTo` can, so concurrent increments merge.
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
 * The text at `path` below `doc[root]`: its parent proxy and its object ID, read through the
 * hidden `A.getBackend`. `A.splice` joins paths with "/", missing keys that are empty or hold
 * "/", and `A.getObjectId(parent, key)` returns the parent's ID for `""` or index `0`.
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
