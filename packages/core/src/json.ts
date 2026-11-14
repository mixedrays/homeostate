/** Whether `JSON.stringify` leaves `value` out of an object and stores it as `null` in an array. */
export const isAbsent = (value: unknown): boolean =>
  value === undefined || typeof value === "function";

/** Whether `value` is an object other than an array, as the diff compares records. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Whether `key` is an own property of `object`. `in` would also find inherited members such
 * as `constructor`, so a record keyed by user input could never lose a key by that name.
 */
export const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/**
 * Assigning this key replaces an object's prototype instead of adding a property, so a peer
 * could make properties such as `isAdmin` appear on other users' state. It is never diffed or synced.
 */
export const PROTO_KEY = "__proto__";

/** What `value` is, as an error about a broken contract names it. */
export const kindOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

/** A primitive as `JSON.stringify` stores it: `NaN` and infinite numbers become `null`. */
export const toJsonPrimitive = (value: unknown): unknown =>
  typeof value === "number" && !Number.isFinite(value) ? null : value;

/** An array item as `JSON.stringify` stores it. */
export const jsonItem = (value: unknown): unknown =>
  isAbsent(value) ? null : value;

/** The entry of `record` at `key` as JSON would store it; `undefined` when it would be left out. */
export const jsonEntry = (
  record: Record<string, unknown>,
  key: string,
): unknown =>
  hasOwn(record, key) && !isAbsent(record[key]) ? record[key] : undefined;

/**
 * `jsonEqual` with `json`, and `deepEqual` without: entries holding `undefined` or a function are
 * then present and compared by identity, and only `NaN` equals a value that is not `===` to it.
 * The rest of the walk, keys included, is shared.
 */
const equal = (a: unknown, b: unknown, json: boolean): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // Loops, since `every` skips holes.
    if (json) {
      for (let i = 0; i < a.length; i++)
        if (!equal(jsonItem(a[i]), jsonItem(b[i]), true)) return false;
    } else {
      for (let i = 0; i < a.length; i++)
        if (!equal(a[i], b[i], false)) return false;
    }
    return true;
  }
  if (isRecord(a) && isRecord(b)) {
    let count = 0;
    for (const key of Object.keys(a)) {
      const value = a[key];
      if (key === PROTO_KEY || (json && isAbsent(value))) continue;
      if (!hasOwn(b, key) || !equal(value, b[key], json)) return false;
      count++;
    }
    // `b` rarely holds `__proto__` or absent entries, so its own key count usually settles it.
    return count === Object.keys(b).length || count === keyCount(b, json);
  }
  return json
    ? toJsonPrimitive(a) === toJsonPrimitive(b)
    : Number.isNaN(a) && Number.isNaN(b);
};

/** The number of entries of `record` that `equal` compares. */
const keyCount = (record: Record<string, unknown>, json: boolean): number => {
  let count = 0;
  for (const key of Object.keys(record))
    if (key !== PROTO_KEY && !(json && isAbsent(record[key]))) count++;
  return count;
};

/**
 * Whether `a` and `b` are equal as values, as `getChanges` matches array items without `json`:
 * an entry holding `undefined` differs from a missing one, and `NaN` equals itself, so a store
 * that keeps holding it has not changed. Keys compare as in `jsonEqual`.
 */
export const deepEqual = (a: unknown, b: unknown): boolean =>
  equal(a, b, false);

/**
 * Whether `a` and `b` are equal as `JSON.stringify` would store them in an object: entries
 * holding `undefined` or a function are absent, such array items, holes included, equal `null`,
 * and so do `NaN` and infinite numbers. Records compare their own keys only, so a key such as
 * `constructor` is never found on an object that lacks it, and `__proto__` keys are ignored on
 * both sides. Meant for JSON values: any other object, such as a `Date`, compares as a record of
 * its own enumerable entries.
 */
export const jsonEqual = (a: unknown, b: unknown): boolean => equal(a, b, true);

/** `jsonEqual` between `a` and `b` as `JSON.stringify` would store them in an array. */
export const jsonItemEqual = (a: unknown, b: unknown): boolean =>
  equal(jsonItem(a), jsonItem(b), true);

/**
 * Returns `value` as `JSON.stringify` would store it: object entries holding `undefined` or a
 * function are left out, such array items, holes included, become `null`, and so do `NaN` and
 * infinite numbers. Own `__proto__` keys are left out too, since the sync engine never syncs
 * them. Only the containers on a path to such a value are copied, so a value that is already
 * JSON is returned as is.
 *
 * `getChanges` with `json: true` applies the same rule as it diffs, and calls it only on the
 * values its changes carry, so a backend need not copy the whole state on every write.
 */
export const toJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    let copy: unknown[] | undefined;
    for (let i = 0; i < value.length; i++) {
      const item = isAbsent(value[i]) ? null : toJsonValue(value[i]);
      if (item !== value[i]) (copy ??= Array.from(value))[i] = item;
    }
    return copy ?? value;
  }

  if (value === null || typeof value !== "object")
    return toJsonPrimitive(value);

  const source = value as Record<string, unknown>;
  let copy: Record<string, unknown> | undefined;
  for (const key of Object.keys(source)) {
    // Assigning `__proto__` would replace the copy's prototype instead of adding a key.
    if (key === PROTO_KEY || isAbsent(source[key]))
      delete (copy ??= { ...source })[key];
    else {
      const item = toJsonValue(source[key]);
      if (item !== source[key]) (copy ??= { ...source })[key] = item;
    }
  }
  return copy ?? value;
};
