import { ChangeType, type ListChange, type TextChange } from "./change.js";
import { getChanges, type DiffOptions, type TextPolicy } from "./diff.js";
import {
  hasOwn,
  isAbsent,
  isRecord,
  jsonEqual,
  jsonItem,
  jsonItemEqual,
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
 * A record's entry `key` as a string that tells apart keys and values of different types, so
 * `id: "1"` is not `id: 1`; `undefined` unless the value is a string, a finite number or a
 * boolean.
 */
const primitiveEntry = (key: string, value: unknown): string | undefined =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value))
    ? JSON.stringify([key, value])
    : undefined;

/** Each primitive entry of `item`, as `primitiveEntry` names it, if `item` is a record. */
const primitiveEntries = (item: unknown): string[] => {
  const record = jsonItem(item);
  if (!isRecord(record)) return [];
  const entries: string[] = [];
  for (const key of Object.keys(record)) {
    if (key === PROTO_KEY) continue;
    const entry = primitiveEntry(key, record[key]);
    if (entry !== undefined) entries.push(entry);
  }
  return entries;
};

/**
 * For each primitive entry of the records in `items`, the index of the one record that holds
 * it, or `-1` where several do.
 */
const entryOwners = (items: readonly unknown[]): Map<string, number> => {
  const owners = new Map<string, number>();
  items.forEach((item, index) => {
    for (const entry of primitiveEntries(item))
      owners.set(entry, owners.has(entry) ? -1 : index);
  });
  return owners;
};

/**
 * The longest run of `pairs`, sorted by their first index, whose second indices increase too,
 * so no two of them cross. Patience sorting, in O(n log n); of equally long runs, it keeps the
 * one that ends with the smallest second indices.
 */
const uncrossed = (
  pairs: readonly (readonly [number, number])[],
): (readonly [number, number])[] => {
  // `ends[length - 1]` is the pair ending the best run of `length` pairs found so far.
  const ends: number[] = [];
  const previous: number[] = [];
  pairs.forEach(([, second], index) => {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pairs[ends[middle]][1] < second) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? ends[low - 1] : -1;
    ends[low] = index;
  });
  const kept: (readonly [number, number])[] = [];
  for (let index = ends.at(-1) ?? -1; index !== -1; index = previous[index])
    kept.push(pairs[index]);
  return kept.reverse();
};

/**
 * What became of `base` where a script paired it with `side`, the item at `index` of the edited
 * array, as `getChanges` decides it: kept when they are equal as JSON, edited when they are two
 * records, two arrays, or two strings that are text, and replaced otherwise.
 */
const pairedFate = (
  base: unknown,
  side: unknown,
  text: TextPolicy | undefined,
  path: Path,
  index: number,
): Fate => {
  const from = jsonItem(base);
  const to = jsonItem(side);
  if (jsonItemEqual(from, to)) return "kept";
  return editedInPlace(from, to, text, [...path, index])
    ? "edited"
    : "replaced";
};

/** Which record of `base`, and which of `side`, holds each primitive entry: `entryOwners`. */
interface Owners {
  base: Map<string, number>;
  side: Map<string, number>;
}

/**
 * The pairs of a base record, among `base[start]` to `base[end - 1]`, and a side record, among
 * `side[from]` to `side[to - 1]`, that share a primitive entry no other record of either array
 * holds, as `owners` counts them, where no other such entry points either record elsewhere,
 * even outside the run; the most of them that keep their order. Linear in the primitive
 * entries of the run's records, plus O(k log k) for its k pairs.
 */
const uniquePairs = (
  base: readonly unknown[],
  start: number,
  end: number,
  side: readonly unknown[],
  from: number,
  to: number,
  owners: Owners,
): (readonly [number, number])[] => {
  /**
   * The record of the other array that every unique entry of `item` points to: `undefined`
   * where none does, and `-1` where they point to several.
   */
  const partner = (
    item: unknown,
    own: Map<string, number>,
    other: Map<string, number>,
  ): number | undefined => {
    let found: number | undefined;
    for (const entry of primitiveEntries(item)) {
      const there = other.get(entry) ?? -1;
      if (there === -1 || own.get(entry) === -1) continue;
      if (found !== undefined && found !== there) return -1;
      found = there;
    }
    return found;
  };
  // Each side record's partner, found once however many base records point to it.
  const sidePartners = new Map<number, number | undefined>();
  const sidePartner = (index: number): number | undefined => {
    if (!sidePartners.has(index))
      sidePartners.set(index, partner(side[index], owners.side, owners.base));
    return sidePartners.get(index);
  };
  const pairs: (readonly [number, number])[] = [];
  for (let item = start; item < end; item++) {
    const index = partner(base[item], owners.base, owners.side);
    if (
      index !== undefined &&
      index >= from &&
      index < to &&
      sidePartner(index) === item
    )
      pairs.push([item, index]);
  }
  return uncrossed(pairs);
};

/**
 * Re-pairs, in `alignment`, the items of `base` and `side` that `getChanges` left unmatched,
 * by unique values before position.
 *
 * `getChanges` matches only items equal as JSON, and pairs the rest by position within each run
 * of deletes and inserts between two matched items. A record changed on this side, beside an
 * insert or a delete, is then paired with its neighbour. So within each such run, a base record
 * and a side record are paired first when they share a primitive entry, such as `id: "r1"`,
 * that no other record of either array holds. An entry several records hold, such as
 * `done: false`, pairs none, so a record still pairs with itself when this side also changed
 * another of its entries. A record that two such entries point to different records is left
 * unpaired, and of pairs that cross, as a moved record's would, the most that keep their order
 * are kept. The items between two such pairs are paired by position, as `getChanges` pairs
 * them, and those left over are deleted or inserted.
 *
 * The owners of each entry are counted once, on the first run with items on both sides, in
 * time linear in the arrays' primitive entries. Each run then costs time linear in its
 * records' primitive entries, plus O(k log k) for its k pairs.
 */
const matchByUniqueValues = (
  alignment: Alignment,
  base: readonly unknown[],
  side: readonly unknown[],
  text: TextPolicy | undefined,
  path: Path,
): void => {
  const { fates, at, inserted } = alignment;
  const length = base.length;
  let owners: Owners | undefined;
  let start = 0;
  while (start < length) {
    if (fates[start] === "kept") {
      start++;
      continue;
    }
    // The run: base items `start` to `end - 1`, and side items `from` to `to - 1`.
    let end = start;
    while (end < length && fates[end] !== "kept") end++;
    const from = start === 0 ? 0 : at[start - 1] + 1;
    const to = end === length ? side.length : at[end];
    if (to === from) {
      start = end;
      continue;
    }
    owners ??= { base: entryOwners(base), side: entryOwners(side) };
    const pairs = uniquePairs(base, start, end, side, from, to, owners);
    if (pairs.length > 0) {
      for (let item = start; item <= end; item++) inserted[item] = [];
      let item = start;
      let index = from;
      // Pair by position up to each pair, and up to the end of the run.
      for (const [pairedItem, pairedIndex] of [...pairs, [end, to] as const]) {
        const count = Math.min(pairedItem - item, pairedIndex - index);
        for (let i = 0; i < count; i++, item++, index++) {
          fates[item] = pairedFate(base[item], side[index], text, path, index);
          at[item] = index;
        }
        for (; item < pairedItem; item++) {
          fates[item] = "deleted";
          at[item] = -1;
        }
        for (; index < pairedIndex; index++) inserted[pairedItem].push(index);
        if (pairedItem < end) {
          fates[item] = pairedFate(base[item], side[index], text, path, index);
          at[item++] = index++;
        }
      }
    }
    start = end;
  }
};

/**
 * Aligns `side` with `base`, two arrays at `path`: as `getChanges` aligns them, with the items
 * it left unmatched re-paired by `matchByUniqueValues`.
 */
const alignItems = (
  base: unknown[],
  side: unknown[],
  text: TextPolicy | undefined,
  path: Path,
): Alignment => {
  const alignment = align(
    getChanges(base, side, diffOptions(text, path)),
    base.length,
    false,
  );
  matchByUniqueValues(alignment, base, side, text, path);
  return alignment;
};

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
): unknown[] =>
  mergeSequence(
    base.length,
    alignItems(base, local, text, path),
    alignItems(base, remote, text, path),
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
 * - Arrays merge item by item, each side's items matched with `base`'s. Items equal as JSON
 *   match first, as `getChanges` matches them. Between two of those, a base record and a side
 *   record match next when they share a string, number or boolean entry, such as `id: "r1"`,
 *   that no other record of either array holds, unless another such entry points one of them
 *   to a different record, or the match would cross another. The rest pair by position.
 *   So an item changed on one side, and moved and changed by the other, still merges with
 *   itself when it holds such an entry. Items both sides inserted at one place keep the remote
 *   ones first.
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
