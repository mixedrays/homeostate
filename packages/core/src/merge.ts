import { ChangeType, type ListChange } from "./change.js";
import { getChanges } from "./diff.js";
import {
  hasOwn,
  isAbsent,
  isRecord,
  jsonEqual,
  jsonItem,
  PROTO_KEY,
} from "./json.js";

/**
 * What an edit script did to one item of the array it edits: left it as it was, replaced it
 * whole, changed it in place, as a record or an array whose contents changed, or deleted it.
 */
type Fate = "kept" | "replaced" | "edited" | "deleted";

/** Where an edit script took each item of an array. */
interface Alignment {
  /** What the script did to each item. */
  fates: Fate[];
  /** The index each item that was not deleted has in the edited array. */
  at: number[];
  /** The indices, in the edited array, of the items inserted before each item, and at the end. */
  inserted: number[][];
}

/**
 * Follows `changes`, a script `getChanges` made for an array of `length` items, item by item. A
 * script's indices address the array as revised by the steps before them, and only increase.
 */
const align = (changes: readonly ListChange[], length: number): Alignment => {
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
    if (change.type === ChangeType.INSERT) inserted[item].push(index++);
    else if (change.type === ChangeType.DELETE) {
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
 * Aligns arrays as a backend's `write` diffs them: as JSON would store them, with every string a
 * value replaced whole, so the merge and the write agree on which item is which.
 */
const DIFF = { json: true, text: () => false } as const;

/** The entry of `record` at `key` as JSON would store it; `undefined` when it would be left out. */
const entry = (record: Record<string, unknown>, key: string): unknown =>
  hasOwn(record, key) && !isAbsent(record[key]) ? record[key] : undefined;

/** Whether `local` is `base` changed in place: two records or two arrays. Strings are values. */
const editedInPlace = (base: unknown, local: unknown): boolean =>
  (isRecord(base) && isRecord(local)) ||
  (Array.isArray(base) && Array.isArray(local));

const mergeRecords = (
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(remote),
    ...Object.keys(local),
    ...Object.keys(base),
  ]);
  keys.delete(PROTO_KEY);
  for (const key of keys) {
    const value = mergeConcurrent(
      entry(base, key),
      entry(local, key),
      entry(remote, key),
    );
    if (value !== undefined) merged[key] = value;
  }
  return merged;
};

/**
 * Each position takes the items both sides inserted there, the remote ones first, then each item
 * of `base` as `mergeConcurrent` merges it, unless a side deleted it. An item the remote side
 * deleted and the local side replaced takes the local value; one it changed in place stays
 * deleted.
 */
const mergeArrays = (
  base: unknown[],
  local: unknown[],
  remote: unknown[],
): unknown[] => {
  const ours = align(getChanges(base, local, DIFF), base.length);
  const theirs = align(getChanges(base, remote, DIFF), base.length);
  const merged: unknown[] = [];
  for (let item = 0; item <= base.length; item++) {
    for (const index of theirs.inserted[item]) merged.push(remote[index]);
    for (const index of ours.inserted[item]) merged.push(local[index]);
    if (item === base.length) break;
    const fate = ours.fates[item];
    if (fate === "deleted") continue;
    if (theirs.fates[item] === "deleted") {
      if (fate === "replaced") merged.push(local[ours.at[item]]);
      continue;
    }
    merged.push(
      mergeConcurrent(
        jsonItem(base[item]),
        jsonItem(local[ours.at[item]]),
        jsonItem(remote[theirs.at[item]]),
      ),
    );
  }
  return merged;
};

/**
 * Merges `local` and `remote`, two JSON values that both descend from `base`, so that each keeps
 * its own changes from `base`. `undefined` stands for an absent value, and is returned for one
 * the merge leaves absent.
 *
 * - Records merge key by key.
 * - Arrays merge item by item, aligned with `base` as `getChanges` aligns them, so an item
 *   changed on one side and moved by the other side's inserts and deletes still merges with
 *   itself. Items both sides inserted at one place keep the remote ones first.
 * - Strings, and every other value, are replaced whole.
 * - Where both sides changed one value differently, the local value wins, as its write would.
 * - A value the remote side deleted stays deleted where the local side changed it in place, as
 *   a CRDT loses an edit inside a deleted container; one the local side replaced takes the local
 *   value. A value the local side deleted stays deleted.
 *
 * What only one side changed is that side's value, by identity.
 */
export const mergeConcurrent = (
  base: unknown,
  local: unknown,
  remote: unknown,
): unknown => {
  if (jsonEqual(base, local)) return remote;
  if (jsonEqual(base, remote) || jsonEqual(local, remote)) return local;
  if (remote === undefined && editedInPlace(base, local)) return undefined;
  if (isRecord(base) && isRecord(local) && isRecord(remote))
    return mergeRecords(base, local, remote);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote))
    return mergeArrays(base, local, remote);
  return local;
};
