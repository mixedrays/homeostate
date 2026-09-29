import { ChangeType, getChanges, type Change } from "@homeostate/core";

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
  flatten(before, after, getChanges(before, after), []);

const flatten = (
  before: unknown,
  after: unknown,
  changes: Change[],
  path: JsonPath,
): DiffLine[] => {
  if (typeof before === "string")
    return [{ kind: "update", path, before, after: after as Json | undefined }];

  const lines: DiffLine[] = [];
  const work = Array.isArray(before) ? before.slice() : null;
  const at = (key: string | number): Json | undefined =>
    (work ? work[key as number] : (before as Plain)[key]) as Json | undefined;

  for (const [type, key, value] of changes) {
    const keyPath = [...path, key];
    switch (type) {
      case ChangeType.INSERT:
        lines.push({ kind: "insert", path: keyPath, after: value as Json });
        work?.splice(key as number, 0, value);
        break;
      case ChangeType.DELETE:
        lines.push({ kind: "delete", path: keyPath, before: at(key) });
        work?.splice(key as number, 1);
        break;
      case ChangeType.UPDATE:
        lines.push({
          kind: "update",
          path: keyPath,
          before: at(key),
          after: value as Json,
        });
        if (work) work[key as number] = value;
        break;
      case ChangeType.PENDING:
        // Steps before this index are final, so it is also the index in `after`.
        lines.push(
          ...flatten(
            at(key),
            (after as Plain)[key as string],
            value as Change[],
            keyPath,
          ),
        );
        break;
    }
  }
  return lines;
};
