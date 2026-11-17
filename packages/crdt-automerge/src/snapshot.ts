import * as A from "@automerge/automerge";

type Plain = Record<string, unknown>;

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/** The number of own enumerable string keys of `value`, counted without allocating. */
const keyCount = (value: object): number => {
  let count = 0;
  for (const key in value) if (hasOwn(value, key)) count++;
  return count;
};

/** Sets `record[key]` as an own entry, even for `__proto__`. */
const put = (record: Plain, key: string, value: unknown): void => {
  if (key === "__proto__")
    Object.defineProperty(record, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  else record[key] = value;
};

/** Whether `a` and `b`, values of our own copy, hold the same JSON. */
const equal = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => equal(item, b[i]))
    );
  if (Array.isArray(b) || keyCount(a) !== keyCount(b)) return false;
  for (const key in a)
    if (
      hasOwn(a, key) &&
      (!hasOwn(b, key) || !equal((a as Plain)[key], (b as Plain)[key]))
    )
      return false;
  return true;
};

/**
 * Returns a function that copies a value read from an Automerge document into plain JSON,
 * reading `ImmutableString`s as strings, and `bigint`s and `Counter`s as numbers. What it returns
 * belongs to the caller, who may change it without changing what later calls return.
 *
 * Given `losers`, maps that lose to `value`, a map, in a conflict, from the one by the greatest
 * operation down, it returns `value` with every key of theirs it lacks, from the first loser
 * that holds it.
 *
 * It keeps two copies. Its own is cached per document object, so a call copies only what
 * changed in the document, and it never leaves this function. A call returns the other: the
 * objects an earlier call returned, checked against its own copy and returned again while they
 * still match, so an unchanged subtree keeps its identity between calls and one a caller changed
 * is copied afresh. The check visits every object, and allocates nothing while they match.
 * A loser is a fresh object on every read, so its keys are checked against what the last merge
 * held instead, and keep their identity while they hold the same JSON.
 */
export const createSnapshot = (): ((
  value: unknown,
  losers?: readonly object[],
) => unknown) => {
  /** Our own copy of each Automerge object. */
  const copies = new WeakMap<object, unknown>();
  /** What a call last returned for each object of our own copy. */
  const shown = new WeakMap<object, unknown>();
  /** Our own copy of the last map merged with losers. */
  let lastMerged: Plain | undefined;

  const copy = (value: unknown): unknown => {
    // A 64-bit integer from `Number.MAX_SAFE_INTEGER` up, or below its negation, or a `Uint`.
    if (typeof value === "bigint") return Number(value);
    if (value === null || typeof value !== "object") return value;
    if (!Array.isArray(value) && A.isImmutableString(value)) return value.val;
    if (!Array.isArray(value) && A.isCounter(value)) return value.value;
    const cached = copies.get(value);
    if (cached !== undefined) return cached;
    const result = Array.isArray(value)
      ? value.map(copy)
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, copy(item)]),
        );
    copies.set(value, result);
    return result;
  };

  /** The caller's copy of `own`, a list of our own copy. */
  const showList = (own: unknown[]): unknown[] => {
    const last = shown.get(own) as unknown[] | undefined;
    // Allocated once an item differs from what the last call returned.
    let result =
      Array.isArray(last) &&
      Object.getPrototypeOf(last) === Array.prototype &&
      last.length === own.length
        ? undefined
        : new Array<unknown>(own.length);
    for (let i = 0; i < own.length; i++) {
      const item = show(own[i]);
      if (result === undefined) {
        if (Object.is(last![i], item)) continue;
        result = last!.slice(0, i);
      }
      result[i] = item;
    }
    if (result === undefined) return last!;
    shown.set(own, result);
    return result;
  };

  /** The caller's copy of `own`, a map of our own copy. */
  const showRecord = (own: Plain): Plain => {
    const last = shown.get(own) as Plain | undefined;
    // Allocated once an entry differs from what the last call returned.
    let result =
      last !== undefined &&
      !Array.isArray(last) &&
      Object.getPrototypeOf(last) === Object.prototype &&
      keyCount(last) === keyCount(own)
        ? undefined
        : {};
    for (const key in own) {
      if (!hasOwn(own, key)) continue;
      const item = show(own[key]);
      if (result === undefined) {
        if (hasOwn(last!, key) && Object.is(last![key], item)) continue;
        result = {};
        // The entries before `key` matched.
        for (const before in own) {
          if (before === key) break;
          if (hasOwn(own, before)) put(result, before, last![before]);
        }
      }
      put(result, key, item);
    }
    if (result === undefined) return last!;
    shown.set(own, result);
    return result;
  };

  const show = (own: unknown): unknown => {
    if (own === null || typeof own !== "object") return own;
    return Array.isArray(own) ? showList(own) : showRecord(own as Plain);
  };

  /** `own`, a map of our own copy, with the keys it lacks from `losers`. */
  const merge = (own: Plain, losers: readonly object[]): Plain => {
    const last = lastMerged;
    const merged: Plain = {};
    let same = last !== undefined;
    const add = (key: string, item: unknown): void => {
      const kept =
        last !== undefined && hasOwn(last, key) && equal(last[key], item)
          ? last[key]
          : item;
      if (same && (!hasOwn(last!, key) || last![key] !== kept)) same = false;
      put(merged, key, kept);
    };
    for (const key in own) if (hasOwn(own, key)) add(key, own[key]);
    for (const loser of losers) {
      const theirs = copy(loser) as Plain;
      for (const key in theirs)
        if (hasOwn(theirs, key) && !hasOwn(merged, key)) add(key, theirs[key]);
    }
    if (same && keyCount(last!) === keyCount(merged)) return last!;
    lastMerged = merged;
    return merged;
  };

  return (value, losers = []) => {
    const own = copy(value);
    if (
      losers.length === 0 ||
      own === null ||
      typeof own !== "object" ||
      Array.isArray(own)
    )
      return show(own);
    return show(merge(own as Plain, losers));
  };
};
