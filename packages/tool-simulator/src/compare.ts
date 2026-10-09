import { defaultSyncFilter } from "@homeostate/core";

/** A key into an object or an index into an array, from the root down. */
export type Path = (string | number)[];

/** Where two JSON values first differ; a side is `undefined` where it lacks the key. */
export interface Difference {
  path: Path;
  left: unknown;
  right: unknown;
}

type Plain = Record<string, unknown>;

const isRecord = (value: unknown): value is Plain =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/** `value` as JSON stores it: functions and `undefined` dropped, a Date as a string. */
export const asJson = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value) ?? "null") as unknown;

/**
 * The keys of a store's state the engine syncs, as JSON: the keys `filter` keeps, without
 * `__proto__`, which the engine never syncs.
 */
export const syncedJson = (
  state: unknown,
  filter: (key: string, value: unknown) => boolean = defaultSyncFilter,
): unknown => {
  const synced: Plain = {};
  if (isRecord(state))
    for (const key of Object.keys(state))
      if (key !== "__proto__" && filter(key, state[key]))
        synced[key] = state[key];
  return asJson(synced);
};

/** The first place where two JSON values differ, or `null` when they are equal. */
export const firstDifference = (
  left: unknown,
  right: unknown,
  path: Path = [],
): Difference | null => {
  if (Object.is(left, right)) return null;

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
      const at = [...path, index];
      if (index >= left.length || index >= right.length)
        return { path: at, left: left[index], right: right[index] };
      const difference = firstDifference(left[index], right[index], at);
      if (difference) return difference;
    }
    return null;
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    for (const key of keys.sort()) {
      const at = [...path, key];
      if (!hasOwn(left, key) || !hasOwn(right, key))
        return {
          path: at,
          left: hasOwn(left, key) ? left[key] : undefined,
          right: hasOwn(right, key) ? right[key] : undefined,
        };
      const difference = firstDifference(left[key], right[key], at);
      if (difference) return difference;
    }
    return null;
  }

  return { path, left, right };
};

/** `todos[0].title`, the way a path reads in code. */
export const formatPath = (path: Path): string => {
  if (path.length === 0) return "the root";
  return path.reduce<string>((text, key) => {
    if (typeof key === "number") return `${text}[${key}]`;
    if (!/^[A-Za-z_$][\w$]*$/.test(key))
      return `${text}[${JSON.stringify(key)}]`;
    return text === "" ? key : `${text}.${key}`;
  }, "");
};

const MAX_VALUE = 60;

/** A value on one line, shortened; `missing` for `undefined`. */
export const formatValue = (value: unknown): string => {
  if (value === undefined) return "missing";
  const text = JSON.stringify(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
};
