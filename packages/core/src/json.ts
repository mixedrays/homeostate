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

/**
 * Whether `a` and `b` are equal as `JSON.stringify` would store them in an object: entries
 * holding `undefined` or a function are absent, such array items, holes included, equal `null`,
 * and so do `NaN` and infinite numbers. Records compare their own keys only, so a key such as
 * `constructor` is never found on an object that lacks it, and `__proto__` keys are ignored on
 * both sides. Meant for JSON values: any other object, such as a `Date`, compares as a record of
 * its own enumerable entries.
 */
export const jsonEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // A loop, since `every` skips holes.
    for (let i = 0; i < a.length; i++)
      if (!jsonItemEqual(a[i], b[i])) return false;
    return true;
  }
  if (isRecord(a) && isRecord(b)) {
    let count = 0;
    for (const key of Object.keys(a)) {
      if (key === PROTO_KEY || isAbsent(a[key])) continue;
      if (!hasOwn(b, key) || !jsonEqual(a[key], b[key])) return false;
      count++;
    }
    // `b` rarely holds absent entries, so its own key count usually settles it.
    return count === Object.keys(b).length || count === jsonKeyCount(b);
  }
  return toJsonPrimitive(a) === toJsonPrimitive(b);
};

/** `jsonEqual` between `a` and `b` as `JSON.stringify` would store them in an array. */
export const jsonItemEqual = (a: unknown, b: unknown): boolean =>
  jsonEqual(jsonItem(a), jsonItem(b));

/** The number of entries of `record` that `JSON.stringify` stores and the diff compares. */
const jsonKeyCount = (record: Record<string, unknown>): number => {
  let count = 0;
  for (const key of Object.keys(record))
    if (key !== PROTO_KEY && !isAbsent(record[key])) count++;
  return count;
};

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
