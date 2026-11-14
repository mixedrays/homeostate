import * as Y from "yjs";
import type { JsonObject, TextPolicy } from "@homeostate/core";

/** The path of a value, as a text policy reads it. */
type Path = Parameters<TextPolicy>[0];

/**
 * Converts a plain JSON value at `path` into its shared counterpart: arrays become Y.Arrays,
 * objects Y.Maps, strings the policy marks as text Y.Texts, and everything else, other strings
 * included, is returned as is. Only `text` reads `path`, so without a policy `path` may be any
 * path; see `childPath`.
 */
export const toSharedType = (
  value: unknown,
  path: Path,
  text: TextPolicy | undefined,
): unknown => {
  if (Array.isArray(value)) return arrayToYArray(value, path, text);
  if (typeof value === "string")
    return text?.(path) === true ? new Y.Text(value) : value;
  if (value !== null && typeof value === "object")
    return objectToYMap(value as Record<string, unknown>, path, text);
  return value;
};

/**
 * The path of the child at `key` of the value at `path`. Only a text policy reads paths, so
 * without one this returns `path` itself instead of building a path for every value written.
 */
export const childPath = (
  path: Path,
  key: string | number,
  text: TextPolicy | undefined,
): Path => (text === undefined ? path : [...path, key]);

const arrayToYArray = (
  array: unknown[],
  path: Path,
  text: TextPolicy | undefined,
): Y.Array<unknown> => {
  const yarray = new Y.Array<unknown>();
  yarray.push(
    array.map((item, i) => toSharedType(item, childPath(path, i, text), text)),
  );
  return yarray;
};

const objectToYMap = (
  object: Record<string, unknown>,
  path: Path,
  text: TextPolicy | undefined,
): Y.Map<unknown> => {
  const ymap = new Y.Map<unknown>();
  for (const [property, value] of Object.entries(object))
    ymap.set(
      property,
      toSharedType(value, childPath(path, property, text), text),
    );
  return ymap;
};

/**
 * Returns the JSON value of `value`, a shared type or a value held in one, as `toJSON` would in
 * one pass, leaving out map entries named `__proto__`: `toJSON` builds objects by assignment,
 * so such an entry would become the prototype of the object holding it. A value a peer stored
 * whole is returned as Yjs decoded it, which may have built such a prototype too; the sync
 * engine copies those objects into plain ones before they reach the store.
 */
const toPlainValue = (value: unknown): unknown => {
  if (value instanceof Y.Map) return toPlainMap(value);
  if (value instanceof Y.Array) return value.map(toPlainValue);
  if (value instanceof Y.AbstractType) return value.toJSON();
  return value;
};

/** `toPlainValue` of a Y.Map, which is a plain object. */
export const toPlainMap = (map: Y.Map<unknown>): JsonObject => {
  const object: JsonObject = {};
  map.forEach((item, key) => {
    // Assigning this key would replace the object's prototype; the engine leaves it out anyway.
    if (key !== "__proto__") object[key] = toPlainValue(item);
  });
  return object;
};
