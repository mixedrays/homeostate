import * as Y from 'yjs';

/**
 * Converts a normal JavaScript array to a YArray shared type. Any nested
 * objects or arrays are turned into YMaps and YArrays, respectively.
 *
 * @param array The array to transform into a YArray
 * @returns A YArray.
 */
export const arrayToYArray = (array: unknown[]): Y.Array<unknown> => {
  const yarray = new Y.Array();

  array.forEach((value) => {
    if (value instanceof Array) yarray.push([arrayToYArray(value)]);
    else if (value !== null && typeof value === 'object') yarray.push([objectToYMap(value as Record<string, unknown>)]);
    else if (typeof value === 'string') yarray.push([stringToYText(value)]);
    else yarray.push([value]);
  });

  return yarray;
};

/**
 * Converts a normal JavaScript object into a YMap shared type. Any nested
 * objects or arrays are turned into YMaps or YArrays, respectively.
 *
 * @param object The object to turn into a YMap shared type.
 * @returns A YMap.
 */
export const objectToYMap = (object: Record<string, unknown>): Y.Map<unknown> => {
  const ymap = new Y.Map();

  Object.entries(object).forEach(([property, value]) => {
    if (value instanceof Array) ymap.set(property, arrayToYArray(value));
    else if (value !== null && typeof value === 'object') ymap.set(property, objectToYMap(value as Record<string, unknown>));
    else if (typeof value === 'string') ymap.set(property, stringToYText(value));
    else ymap.set(property, value);
  });

  return ymap;
};

export const stringToYText = (string: string): Y.Text => new Y.Text(string);
