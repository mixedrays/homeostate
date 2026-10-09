import * as Y from "yjs";
import type { TextPolicy } from "@homeostate/core";

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
 * so such an entry would become the prototype of the object holding it. Values a peer stored
 * whole go through `withPlainPrototypes`.
 */
export const toPlainValue = (value: unknown): unknown => {
  if (value instanceof Y.Map) {
    const object: Record<string, unknown> = {};
    value.forEach((item, key) => {
      // Assigning this key would replace the object's prototype; the engine leaves it out anyway.
      if (key !== "__proto__") object[key] = toPlainValue(item);
    });
    return object;
  }
  if (value instanceof Y.Array) return value.map(toPlainValue);
  if (value instanceof Y.AbstractType) return value.toJSON();
  return withPlainPrototypes(value);
};

/**
 * `toJSON` builds objects by assignment, so a map entry a peer named `__proto__` becomes the
 * prototype of the object holding it, and its entries read as inherited properties. Returns
 * `value` with every such object replaced by a plain copy of its own properties, copying only
 * the containers on a path to one.
 */
const withPlainPrototypes = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || ArrayBuffer.isView(value))
    return value;

  const source = value as Record<string, unknown>;
  let copy =
    Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype
      ? undefined
      : copyOf(value);
  for (const key of Object.keys(source)) {
    // Assigning this key would replace the copy's prototype; the engine leaves it out anyway.
    if (key === "__proto__") continue;
    const item = withPlainPrototypes(source[key]);
    if (item !== source[key]) (copy ??= copyOf(value))[key] = item;
  }

  return copy ?? value;
};

const copyOf = (value: object): Record<string, unknown> =>
  (Array.isArray(value) ? [...value] : { ...value }) as Record<string, unknown>;
