import * as Y from "yjs";
import type { JsonObject, TextPolicy } from "@homeostate/core";

export type SharedType = Y.Map<unknown> | Y.Array<unknown> | Y.Text;

export type Path = readonly (string | number)[];

/**
 * Converts a plain JSON value at `path` into its shared counterpart: arrays become Y.Arrays,
 * objects Y.Maps, strings the policy marks as text Y.Texts, and everything else, other strings
 * included, is returned as is.
 */
export const toSharedType = (
  value: unknown,
  path: Path,
  text: TextPolicy,
): unknown => {
  if (Array.isArray(value)) return arrayToYArray(value, path, text);
  if (typeof value === "string") return text(path) ? new Y.Text(value) : value;
  if (value !== null && typeof value === "object")
    return objectToYMap(value as Record<string, unknown>, path, text);
  return value;
};

const arrayToYArray = (
  array: unknown[],
  path: Path,
  text: TextPolicy,
): Y.Array<unknown> => {
  const yarray = new Y.Array<unknown>();
  yarray.push(array.map((item, i) => toSharedType(item, [...path, i], text)));
  return yarray;
};

const objectToYMap = (
  object: Record<string, unknown>,
  path: Path,
  text: TextPolicy,
): Y.Map<unknown> => {
  const ymap = new Y.Map<unknown>();
  for (const [property, value] of Object.entries(object))
    ymap.set(property, toSharedType(value, [...path, property], text));
  return ymap;
};

/**
 * Returns the JSON value of `value`, a shared type or a value held in one, as `toJSON` would in
 * one pass, leaving out map entries named `__proto__`: `toJSON` builds objects by assignment,
 * so such an entry would become the prototype of the object holding it. A value a peer stored
 * whole is returned as Yjs decoded it, which may have built such a prototype too; the sync
 * engine copies those objects into plain ones before they reach the store.
 */
export const toPlainValue = (value: unknown): unknown => {
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
