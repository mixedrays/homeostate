import {
  ChangeType,
  getChanges,
  type ListChange,
  type RecordChange,
} from "@homeostate/core";

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };

export type JsonObject = { [key: string]: Json };

/** A key into an object or an index into an array, from the root down. */
export type JsonPath = (string | number)[];

type Plain = Record<string, unknown>;

export const isRecord = (value: unknown): value is Plain =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The JSON view of a state: what `JSON.stringify` keeps, so functions and `undefined` are
 * dropped. Throws on a cycle or a BigInt, as `JSON.stringify` does.
 */
export const toJsonObject = (value: unknown): JsonObject => {
  const json: unknown = JSON.parse(JSON.stringify(value) ?? "null");
  return isRecord(json) ? (json as JsonObject) : {};
};

/** A value in a synced key that is not plain JSON, so the engine does not sync it as it is. */
export interface NonJsonValue {
  path: JsonPath;
  /** What the value is: a class such as `Date` or `Map`, `BigInt`, `NaN`, `circular reference`… */
  kind: string;
}

const nonJsonKind = (value: unknown): string | null => {
  switch (typeof value) {
    case "bigint":
      return "BigInt";
    case "symbol":
      return "Symbol";
    case "number":
      return Number.isFinite(value) ? null : String(value);
    case "object": {
      if (value === null || Array.isArray(value)) return null;
      const prototype: unknown = Object.getPrototypeOf(value);
      if (prototype === Object.prototype || prototype === null) return null;
      const name = (prototype as { constructor?: { name?: unknown } })
        .constructor?.name;
      // `Object` from another realm, such as an iframe, is still a plain object.
      if (name === "Object") return null;
      return typeof name === "string" && name !== "" ? name : "class instance";
    }
    default:
      return null;
  }
};

/**
 * The values under `value` that are not plain JSON: class instances such as a Date, Map or
 * Set, BigInts, symbols, NaN and the infinities, and circular references. Functions and
 * `undefined` are not reported, since they are dropped as JSON drops them.
 */
export const findNonJson = (
  value: unknown,
  path: JsonPath = [],
  ancestors: Set<object> = new Set(),
): NonJsonValue[] => {
  const kind = nonJsonKind(value);
  if (kind !== null) return [{ path, kind }];
  if (value === null || typeof value !== "object") return [];
  if (ancestors.has(value)) return [{ path, kind: "circular reference" }];

  ancestors.add(value);
  const found = Array.isArray(value)
    ? value.flatMap((item, index) =>
        findNonJson(item, [...path, index], ancestors),
      )
    : Object.keys(value)
        .filter((key) => key !== "__proto__")
        .flatMap((key) =>
          findNonJson((value as Plain)[key], [...path, key], ancestors),
        );
  ancestors.delete(value);
  return found;
};

export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length && a.every((value, i) => deepEqual(value, b[i]))
    );
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && deepEqual(a[key], b[key]))
    );
  }
  return false;
};

/**
 * `next`, reusing every subtree of `current` that is deep-equal to its counterpart, so a
 * store handed the result sees new references only where something changed.
 */
export const share = (current: unknown, next: unknown): unknown => {
  if (deepEqual(current, next)) return current;
  if (Array.isArray(current) && Array.isArray(next))
    return next.map((value, i) => share(current[i], value));
  if (isRecord(current) && isRecord(next)) {
    const result: Plain = {};
    for (const [key, value] of Object.entries(next))
      result[key] = share(current[key], value);
    return result;
  }
  return next;
};

export const getIn = (value: unknown, path: JsonPath): unknown => {
  let node = value;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Plain)[key as string];
  }
  return node;
};

/** A copy of `root` with `value` at `path`; `undefined` removes the key or array item. */
export const setIn = (
  root: unknown,
  path: JsonPath,
  value: unknown,
): unknown => {
  if (path.length === 0) return value;
  const [key, ...rest] = path;

  if (Array.isArray(root)) {
    const index = Number(key);
    const copy = root.slice();
    if (rest.length === 0 && value === undefined) copy.splice(index, 1);
    else copy[index] = setIn(root[index], rest, value);
    return copy;
  }

  const copy: Plain = isRecord(root) ? { ...root } : {};
  if (rest.length === 0 && value === undefined) delete copy[key as string];
  else copy[key as string] = setIn(copy[key as string], rest, value);
  return copy;
};

/** `todos[0].title`, the way a path reads in code. */
export const formatPath = (path: JsonPath): string =>
  path.reduce<string>((text, key) => {
    if (typeof key === "number") return `${text}[${key}]`;
    const segment = /^[A-Za-z_$][\w$]*$/.test(key)
      ? key
      : `[${JSON.stringify(key)}]`;
    if (segment.startsWith("[")) return `${text}${segment}`;
    return text === "" ? segment : `${text}.${segment}`;
  }, "");

export type DiffKind = "insert" | "update" | "delete";

/** One leaf of a diff, with the value it had before and the value it has after. */
export interface DiffLine {
  kind: DiffKind;
  path: JsonPath;
  before?: Json;
  after?: Json;
}

/**
 * The changes from `before` to `after` as path-addressed lines, derived from core's
 * `getChanges`. Array indices are those of the array as the earlier lines left it, as in
 * the edit script. A string edit is shown as one update of the whole string.
 */
export const diffJson = (before: JsonObject, after: JsonObject): DiffLine[] =>
  flattenRecord(before, after, getChanges(before, after), []);

type Pending = Extract<RecordChange | ListChange, { type: "pending" }>;

/** The lines of the pending step `change`, from the values at its key before and after. */
const flattenPending = (
  before: unknown,
  after: unknown,
  change: Pending,
  path: JsonPath,
): DiffLine[] => {
  if (change.kind === "text")
    return [
      { kind: "update", path, before: before as Json, after: after as Json },
    ];
  if (change.kind === "list")
    return flattenList(before as unknown[], after, change.changes, path);
  return flattenRecord(before as Plain, after, change.changes, path);
};

const flattenRecord = (
  before: Plain,
  after: unknown,
  changes: RecordChange[],
  path: JsonPath,
): DiffLine[] => {
  const lines: DiffLine[] = [];
  for (const change of changes) {
    const keyPath = [...path, change.key];
    const previous = before[change.key] as Json | undefined;
    switch (change.type) {
      case ChangeType.INSERT:
        lines.push({
          kind: "insert",
          path: keyPath,
          after: change.value as Json,
        });
        break;
      case ChangeType.DELETE:
        lines.push({ kind: "delete", path: keyPath, before: previous });
        break;
      case ChangeType.UPDATE:
        lines.push({
          kind: "update",
          path: keyPath,
          before: previous,
          after: change.value as Json,
        });
        break;
      case ChangeType.PENDING:
        lines.push(
          ...flattenPending(
            previous,
            (after as Plain)[change.key],
            change,
            keyPath,
          ),
        );
        break;
    }
  }
  return lines;
};

const flattenList = (
  before: unknown[],
  after: unknown,
  changes: ListChange[],
  path: JsonPath,
): DiffLine[] => {
  const lines: DiffLine[] = [];
  const work = before.slice();
  for (const change of changes) {
    const keyPath = [...path, change.key];
    switch (change.type) {
      case ChangeType.INSERT:
        lines.push({
          kind: "insert",
          path: keyPath,
          after: change.value as Json,
        });
        work.splice(change.key, 0, change.value);
        break;
      case ChangeType.DELETE:
        // One line per item, each at the index the line before it left.
        for (const item of work.splice(change.key, change.count ?? 1))
          lines.push({ kind: "delete", path: keyPath, before: item as Json });
        break;
      case ChangeType.UPDATE:
        lines.push({
          kind: "update",
          path: keyPath,
          before: work[change.key] as Json,
          after: change.value as Json,
        });
        work[change.key] = change.value;
        break;
      case ChangeType.PENDING:
        // Steps before this index are final, so it is also the index in `after`.
        lines.push(
          ...flattenPending(
            work[change.key],
            (after as unknown[])[change.key],
            change,
            keyPath,
          ),
        );
        break;
    }
  }
  return lines;
};
