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
 * through its path, since Automerge splices text by path; an `ImmutableString`, held by a peer
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
    if (inserted.length > 0)
      A.splice(doc, [root, ...path], index, deleteCount, inserted);
    else A.splice(doc, [root, ...path], index, deleteCount);
  },
});
