import * as A from "@automerge/automerge";
import {
  applyStringChanges,
  ChangeType,
  getChanges,
  type Change,
  type TextPolicy,
} from "@homeostate/core";

export type Container = Record<string, unknown>;

type Path = A.Prop[];

const isRecord = (value: unknown): value is Container =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** `current` is a `read()` snapshot, in which every string is a plain string. */
export const diff = (
  current: unknown,
  next: unknown,
  text: TextPolicy,
): Change[] | null => {
  if (!isRecord(next)) return [];
  return isRecord(current) ? getChanges(current, next, { text }) : null;
};

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
 * Applies `changes` to the container at `path` under `doc[root]`. Paths given to the policy
 * start below `root`.
 */
export const applyChanges = (
  doc: Container,
  root: string,
  path: Path,
  changes: Change[],
  text: TextPolicy,
): void => {
  const container = path.reduce<unknown>(
    (value, prop) => (value as Container)[prop],
    doc[root],
  );
  const target = { doc, root, path, text };
  for (const [type, key, value] of changes) {
    if (typeof container === "string")
      applyToText(target, type, key as number, value);
    else if (Array.isArray(container))
      applyToList(target, container, type, key as number, value);
    else applyToMap(target, container as Container, type, key as string, value);
  }
};

interface Target {
  doc: Container;
  root: string;
  path: Path;
  text: TextPolicy;
}

/**
 * Follows a pending step into the child at `key`. Text held as an `ImmutableString`, by a peer
 * with another policy or an older version, is replaced by the edited string instead.
 */
const applyPending = (
  { doc, root, path, text }: Target,
  parent: Container | unknown[],
  key: string | number,
  changes: Change[],
): void => {
  const at = [...path, key];
  const child = (parent as Container)[key];
  // A list proxy claims every property, so `isImmutableString` alone accepts one.
  if (!Array.isArray(child) && A.isImmutableString(child))
    (parent as Container)[key] = toAutomerge(
      applyStringChanges(child.val, changes),
      at,
      text,
    );
  else applyChanges(doc, root, at, changes, text);
};

const applyToMap = (
  target: Target,
  map: Container,
  type: ChangeType,
  key: string,
  value: unknown,
): void => {
  switch (type) {
    case ChangeType.INSERT:
    case ChangeType.UPDATE:
      map[key] = toAutomerge(value, [...target.path, key], target.text);
      break;

    case ChangeType.DELETE:
      delete map[key];
      break;

    case ChangeType.PENDING:
      applyPending(target, map, key, value as Change[]);
      break;
  }
};

const applyToList = (
  target: Target,
  list: unknown[],
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  switch (type) {
    case ChangeType.INSERT:
      A.insertAt(
        list,
        index,
        toAutomerge(value, [...target.path, index], target.text),
      );
      break;

    case ChangeType.UPDATE:
      list[index] = toAutomerge(value, [...target.path, index], target.text);
      break;

    case ChangeType.DELETE:
      A.deleteAt(list, index, 1);
      break;

    case ChangeType.PENDING:
      applyPending(target, list, index, value as Change[]);
      break;
  }
};

const applyToText = (
  { doc, root, path }: Target,
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  if (type === ChangeType.INSERT)
    A.splice(doc, [root, ...path], index, 0, value as string);
  else if (type === ChangeType.DELETE)
    A.splice(
      doc,
      [root, ...path],
      index,
      typeof value === "number" ? value : 1,
    );
};
