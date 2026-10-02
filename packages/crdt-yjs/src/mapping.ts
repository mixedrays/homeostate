import * as Y from "yjs";

export type SharedType = Y.Map<unknown> | Y.Array<unknown> | Y.Text;

/**
 * Converts a plain JSON value into its shared counterpart: arrays become Y.Arrays,
 * objects Y.Maps, strings Y.Texts, and everything else is returned as is.
 */
export const toSharedType = (value: unknown): unknown => {
  if (Array.isArray(value)) return arrayToYArray(value);
  if (typeof value === "string") return stringToYText(value);
  if (value !== null && typeof value === "object")
    return objectToYMap(value as Record<string, unknown>);
  return value;
};

export const arrayToYArray = (array: unknown[]): Y.Array<unknown> => {
  const yarray = new Y.Array<unknown>();
  yarray.push(array.map(toSharedType));
  return yarray;
};

export const objectToYMap = (
  object: Record<string, unknown>,
): Y.Map<unknown> => {
  const ymap = new Y.Map<unknown>();
  for (const [property, value] of Object.entries(object))
    ymap.set(property, toSharedType(value));
  return ymap;
};

export const stringToYText = (string: string): Y.Text => new Y.Text(string);

/**
 * `toJSON` builds objects by assignment, so a map entry a peer named `__proto__` becomes the
 * prototype of the object holding it, and its entries read as inherited properties. Returns
 * `value` with every such object replaced by a plain copy of its own properties, copying only
 * the containers on a path to one.
 */
export const withPlainPrototypes = (value: unknown): unknown => {
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
