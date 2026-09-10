import * as Y from 'yjs';

export type SharedType = Y.Map<unknown> | Y.Array<unknown> | Y.Text;

/**
 * Converts a plain JSON value into its shared counterpart: arrays become Y.Arrays,
 * objects Y.Maps, strings Y.Texts, and everything else is returned as is.
 */
export const toSharedType = (value: unknown): unknown => {
  if (Array.isArray(value)) return arrayToYArray(value);
  if (typeof value === 'string') return stringToYText(value);
  if (value !== null && typeof value === 'object')
    return objectToYMap(value as Record<string, unknown>);
  return value;
};

export const arrayToYArray = (array: unknown[]): Y.Array<unknown> => {
  const yarray = new Y.Array<unknown>();
  yarray.push(array.map(toSharedType));
  return yarray;
};

export const objectToYMap = (object: Record<string, unknown>): Y.Map<unknown> => {
  const ymap = new Y.Map<unknown>();
  for (const [property, value] of Object.entries(object)) ymap.set(property, toSharedType(value));
  return ymap;
};

export const stringToYText = (string: string): Y.Text => new Y.Text(string);
