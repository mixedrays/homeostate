import {
  ChangeType,
  getChanges,
  jsonEqual,
  type ListChange,
  type TextChange,
  type TextPolicy,
} from "@homeostate/core";
import type { Path } from "./mapping.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** `record`'s own entry at `key`, never an inherited member such as `constructor`. */
const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/**
 * What an edit script did to one item of the sequence it edits: left it as it was, replaced it
 * whole, changed it in place, as an object whose entries changed, or deleted it.
 */
type Fate = "kept" | "replaced" | "edited" | "deleted";

/** Where an edit script took each item of a sequence, an array or the UTF-16 units of a string. */
interface Alignment {
  /** What the script did to each item. */
  fates: Fate[];
  /** The index each item that was not deleted has in the edited sequence. */
  at: number[];
  /** The indices, in the edited sequence, of the items inserted before each item, and at the end. */
  inserted: number[][];
}

/**
 * Follows `changes`, a script `getChanges` made for a sequence of `length` items, item by item.
 * A script's indices address the sequence as revised by the steps before them, and only
 * increase. In a string's script, an insert carries a run of units.
 */
const align = (
  changes: readonly (ListChange | TextChange)[],
  length: number,
  units: boolean,
): Alignment => {
  const fates = new Array<Fate>(length).fill("kept");
  const at = new Array<number>(length).fill(-1);
  const inserted = Array.from({ length: length + 1 }, (): number[] => []);
  let item = 0;
  let index = 0;
  const keepUntil = (key: number): void => {
    while (index < key && item < length) at[item++] = index++;
  };
  for (const change of changes) {
    keepUntil(change.key);
    if (change.type === ChangeType.INSERT) {
      const count = units ? (change.value as string).length : 1;
      for (let i = 0; i < count; i++) inserted[item].push(index++);
    } else if (change.type === ChangeType.DELETE) {
      const end = item + (change.count ?? 1);
      while (item < end) fates[item++] = "deleted";
    } else {
      fates[item] = change.type === ChangeType.UPDATE ? "replaced" : "edited";
      at[item++] = index++;
    }
  }
  keepUntil(Infinity);
  return { fates, at, inserted };
};

/**
 * Merges two scripts from `seen`: `local`, to the store's `next`, and `remote`, to `real`.
 * Each position takes the items both sides inserted there, the remote ones first, then each
 * item of `seen` as `both` merges it, unless a side deleted it. An item the remote side deleted
 * and the store replaced takes the store's value, as a CRDT keeps a new item beside a deleted
 * one; one it edited in place stays deleted, as an edit inside a deleted container is lost.
 */
const mergeSequence = (
  length: number,
  local: Alignment,
  remote: Alignment,
  value: { real: (index: number) => unknown; next: (index: number) => unknown },
  both: (item: number, real: number, next: number, at: number) => unknown,
): unknown[] => {
  const merged: unknown[] = [];
  for (let item = 0; item <= length; item++) {
    for (const index of remote.inserted[item]) merged.push(value.real(index));
    for (const index of local.inserted[item]) merged.push(value.next(index));
    if (item === length) break;
    const fate = local.fates[item];
    if (fate === "deleted") continue;
    if (remote.fates[item] === "deleted") {
      if (fate === "replaced") merged.push(value.next(local.at[item]));
      continue;
    }
    merged.push(both(item, remote.at[item], local.at[item], merged.length));
  }
  return merged;
};

/** Whether `next` is `seen` changed in place: both objects, arrays, or strings stored as text. */
const editedInPlace = (
  seen: unknown,
  next: unknown,
  text: TextPolicy,
  path: Path,
): boolean =>
  (isObject(seen) && isObject(next)) ||
  (Array.isArray(seen) && Array.isArray(next)) ||
  (typeof seen === "string" && typeof next === "string" && text(path));

/**
 * Applies the change from `seen` to `next` to `real`, a three-way merge with `seen` as the
 * base: what the store changed from what it was shown takes its new value, and what it left
 * alone keeps the value it really has, or stays absent, as a value a gap hides does.
 *
 * - Objects merge key by key.
 * - Arrays, and strings `text` marks as text, merge position by position: the store's inserts
 *   and deletes are applied to `real`, after the items around them, and what either side
 *   deleted stays deleted. Items both sides kept merge in turn, so a change inside a list item
 *   merges key by key.
 * - Where both sides changed one value otherwise, such as both replacing a list item or a plain
 *   string, the store's value wins, as a later write would in the document.
 * - A value the remote side deleted stays deleted where the store changed it in place, as the
 *   document loses an edit inside a deleted container; one the store replaced takes the store's
 *   value.
 *
 * `undefined` stands for an absent value, and `path` is the merged value's path, for `text`.
 */
export const rebase = (
  real: unknown,
  seen: unknown,
  next: unknown,
  text: TextPolicy,
  path: Path = [],
): unknown => {
  if (jsonEqual(seen, next)) return real;
  if (jsonEqual(seen, real)) return next;
  // Deleted on the remote side and changed in place by the store, which the document would lose
  // with the container that held it.
  if (real === undefined && editedInPlace(seen, next, text, path))
    return undefined;
  if (isObject(real) && isObject(seen) && isObject(next)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(real),
      ...Object.keys(seen),
      ...Object.keys(next),
    ]);
    for (const key of keys) {
      if (key === "__proto__") continue;
      const value = rebase(
        own(real, key),
        own(seen, key),
        own(next, key),
        text,
        [...path, key],
      );
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  if (Array.isArray(real) && Array.isArray(seen) && Array.isArray(next)) {
    const options = {
      json: true,
      text: (at: readonly (string | number)[]) => text([...path, ...at]),
    };
    return mergeSequence(
      seen.length,
      align(getChanges(seen, next, options), seen.length, false),
      align(getChanges(seen, real, options), seen.length, false),
      { real: (index) => real[index], next: (index) => next[index] },
      (item, inReal, inNext, at) =>
        rebase(real[inReal], seen[item], next[inNext], text, [...path, at]),
    );
  }
  if (
    typeof real === "string" &&
    typeof seen === "string" &&
    typeof next === "string" &&
    text(path)
  )
    return mergeSequence(
      seen.length,
      align(getChanges(seen, next), seen.length, true),
      align(getChanges(seen, real), seen.length, true),
      { real: (index) => real[index], next: (index) => next[index] },
      (_item, inReal) => real[inReal],
    ).join("");
  return next;
};
