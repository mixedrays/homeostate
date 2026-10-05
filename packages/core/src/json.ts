/** Whether `JSON.stringify` leaves `value` out of an object and stores it as `null` in an array. */
export const isAbsent = (value: unknown): boolean =>
  value === undefined || typeof value === "function";

/**
 * Returns `value` as `JSON.stringify` would store it: object entries holding `undefined` or a
 * function are left out, and such array items, holes included, become `null`. Own `__proto__`
 * keys are left out too, since the sync engine never syncs them. Only the containers on a path
 * to such a value are copied, so a value that is already JSON is returned as is.
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

  if (value === null || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  let copy: Record<string, unknown> | undefined;
  for (const key of Object.keys(source)) {
    // Assigning `__proto__` would replace the copy's prototype instead of adding a key.
    if (key === "__proto__" || isAbsent(source[key]))
      delete (copy ??= { ...source })[key];
    else {
      const item = toJsonValue(source[key]);
      if (item !== source[key]) (copy ??= { ...source })[key] = item;
    }
  }
  return copy ?? value;
};
