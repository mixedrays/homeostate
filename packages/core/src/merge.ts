import { ChangeType, type ListChange, type TextChange } from "./change.js";
import { getChanges, type DiffOptions, type TextPolicy } from "./diff.js";
import {
  hasOwn,
  isAbsent,
  isRecord,
  jsonEqual,
  jsonItem,
  PROTO_KEY,
} from "./json.js";

/** Options for `mergeConcurrent`. */
export interface MergeOptions {
  /**
   * Which strings are text, merged by UTF-16 unit, by their path from the root of the merged
   * value. Without it, every string is a value, replaced whole.
   */
  text?: TextPolicy;
}

/** A value's path from the root of the merged value: record keys and array indices. */
type Path = readonly (string | number)[];

/**
 * What an edit script did to one item of the sequence it edits: left it as it was, replaced it
 * whole, changed it in place, as a record, an array or a text whose contents changed, or
 * deleted it.
 */
type Fate = "kept" | "replaced" | "edited" | "deleted";

/** Where an edit script took each item of a sequence, an array or the UTF-16 units of a text. */
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
 * increase. With `units`, the sequence is a string, and an insert carries a run of units.
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
 * Aligns arrays as a backend's `write` diffs them: as JSON would store them, with every string a
 * value replaced whole, so the merge and the write agree on which item is which.
 */
const DIFF = { json: true, text: () => false } as const;

/** The options that align the array at `path`, its strings that `text` marks diffed as text. */
const diffOptions = (text: TextPolicy | undefined, path: Path): DiffOptions =>
  text === undefined
    ? DIFF
    : { json: true, text: (at) => text([...path, ...at]) };

/** The entry of `record` at `key` as JSON would store it; `undefined` when it would be left out. */
const entry = (record: Record<string, unknown>, key: string): unknown =>
  hasOwn(record, key) && !isAbsent(record[key]) ? record[key] : undefined;

/** Whether `value` is a string that `text` marks as text at `path`. */
const isText = (
  value: unknown,
  text: TextPolicy | undefined,
  path: Path,
): value is string =>
  typeof value === "string" && text !== undefined && text(path);

/**
 * Whether `local` is `base` changed in place: two records, two arrays, or two strings that are
 * text at `path`. Any other string is a value.
 */
const editedInPlace = (
  base: unknown,
  local: unknown,
  text: TextPolicy | undefined,
  path: Path,
): boolean =>
  (isRecord(base) && isRecord(local)) ||
  (Array.isArray(base) && Array.isArray(local)) ||
  (typeof local === "string" && isText(base, text, path));

/**
 * Merges `ours` and `theirs`, two scripts that edit a sequence of `length` items, to `local`
 * and to `remote`. Each position takes the items both sides inserted there, the remote ones
 * first, then each item as `both` merges it, unless a side deleted it. An item the remote side
 * deleted and the local side replaced takes the local value, as a CRDT keeps a new item beside
 * a deleted one; one it changed in place stays deleted, as an edit inside a deleted container is
 * lost. `both` takes the item's index in the sequence, in `local`, in `remote`, and in the
 * merged sequence.
 */
const mergeSequence = <T>(
  length: number,
  ours: Alignment,
  theirs: Alignment,
  local: ArrayLike<T>,
  remote: ArrayLike<T>,
  both: (item: number, inLocal: number, inRemote: number, at: number) => T,
): T[] => {
  const merged: T[] = [];
  for (let item = 0; item <= length; item++) {
    for (const index of theirs.inserted[item]) merged.push(remote[index]);
    for (const index of ours.inserted[item]) merged.push(local[index]);
    if (item === length) break;
    const fate = ours.fates[item];
    if (fate === "deleted") continue;
    if (theirs.fates[item] === "deleted") {
      if (fate === "replaced") merged.push(local[ours.at[item]]);
      continue;
    }
    merged.push(both(item, ours.at[item], theirs.at[item], merged.length));
  }
  return merged;
};

const mergeRecords = (
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  text: TextPolicy | undefined,
  path: Path,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(remote),
    ...Object.keys(local),
    ...Object.keys(base),
  ]);
  keys.delete(PROTO_KEY);
  for (const key of keys) {
    const value = merge(
      entry(base, key),
      entry(local, key),
      entry(remote, key),
      text,
      [...path, key],
    );
    if (value !== undefined) merged[key] = value;
  }
  return merged;
};

/** Merges arrays item by item, each item read as JSON would store it. */
const mergeArrays = (
  base: unknown[],
  local: unknown[],
  remote: unknown[],
  text: TextPolicy | undefined,
  path: Path,
): unknown[] => {
  const options = diffOptions(text, path);
  return mergeSequence(
    base.length,
    align(getChanges(base, local, options), base.length, false),
    align(getChanges(base, remote, options), base.length, false),
    local,
    remote,
    (item, inLocal, inRemote, at) =>
      merge(
        jsonItem(base[item]),
        jsonItem(local[inLocal]),
        jsonItem(remote[inRemote]),
        text,
        [...path, at],
      ),
  );
};

/** Merges text by UTF-16 unit, as arrays merge item by item. */
const mergeText = (base: string, local: string, remote: string): string =>
  mergeSequence(
    base.length,
    align(getChanges(base, local), base.length, true),
    align(getChanges(base, remote), base.length, true),
    local,
    remote,
    // A unit both sides kept is the same on each.
    (_item, _inLocal, inRemote) => remote[inRemote],
  ).join("");

/** `mergeConcurrent` for the value at `path`, with the strings `text` marks as text. */
const merge = (
  base: unknown,
  local: unknown,
  remote: unknown,
  text: TextPolicy | undefined,
  path: Path,
): unknown => {
  if (jsonEqual(base, local)) return remote;
  if (jsonEqual(base, remote) || jsonEqual(local, remote)) return local;
  if (remote === undefined && editedInPlace(base, local, text, path))
    return undefined;
  if (isRecord(base) && isRecord(local) && isRecord(remote))
    return mergeRecords(base, local, remote, text, path);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote))
    return mergeArrays(base, local, remote, text, path);
  if (
    typeof local === "string" &&
    typeof remote === "string" &&
    isText(base, text, path)
  )
    return mergeText(base, local, remote);
  return local;
};

/**
 * Merges `local` and `remote`, two JSON values that both descend from `base`, so that each keeps
 * its own changes from `base`. `undefined` stands for an absent value, and is returned for one
 * the merge leaves absent. Entries holding `undefined` or a function are absent, and such array
 * items are `null`, as JSON would store them. No input is mutated.
 *
 * - Records merge key by key. `__proto__` keys are ignored.
 * - Arrays merge item by item, aligned with `base` as `getChanges` aligns them, so an item
 *   changed on one side and moved by the other side's inserts and deletes still merges with
 *   itself. Items both sides inserted at one place keep the remote ones first.
 * - Strings `options.text` marks as text merge by UTF-16 unit, as arrays merge item by item.
 *   Every other string, and every other value, is replaced whole.
 * - Where both sides changed one value differently, the local value wins, as its write would.
 * - A value the remote side deleted stays deleted where the local side changed it in place, as
 *   a CRDT loses an edit inside a deleted container: a record, an array or a text. One the local
 *   side replaced takes the local value. A value the local side deleted stays deleted.
 *
 * What only one side changed is that side's value, by identity. Where both sides are equal, at
 * any level, the merge returns the local value, so an item both sides inserted at one place is
 * kept once in an array that is equal on both sides, but twice in one that differs otherwise.
 *
 * @example
 * mergeConcurrent({ a: 0, b: 0 }, { a: 1, b: 0 }, { a: 0, b: 2 }); // { a: 1, b: 2 }
 * mergeConcurrent("abc", "abcX", "Yabc", { text: () => true }); // "YabcX"
 */
export const mergeConcurrent = (
  base: unknown,
  local: unknown,
  remote: unknown,
  options: MergeOptions = {},
): unknown => merge(base, local, remote, options.text, []);
