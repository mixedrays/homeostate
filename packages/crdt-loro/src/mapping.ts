import { LoroList, LoroMap, LoroText } from "loro-crdt";
import type { TextPolicy } from "@homeostate/core";

export type SharedContainer = LoroMap | LoroList | LoroText;

export type Path = readonly (string | number)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Sets `key` of the map at `path` to `value`: arrays become LoroLists, objects LoroMaps,
 * strings the policy marks as text LoroTexts, and everything else, other strings included,
 * a plain value.
 */
export const setMapEntry = (
  map: LoroMap,
  key: string,
  value: unknown,
  path: Path,
  text: TextPolicy,
): void => {
  const at = [...path, key];
  if (Array.isArray(value))
    fillList(map.setContainer(key, new LoroList()), value, at, text);
  else if (typeof value === "string" && text(at))
    map.setContainer(key, new LoroText()).insert(0, value);
  else if (isRecord(value))
    fillMap(map.setContainer(key, new LoroMap()), value, at, text);
  else map.set(key, value);
};

/** Inserts `value` at `index` of the list at `path`, converted as `setMapEntry` does. */
export const insertListItem = (
  list: LoroList,
  index: number,
  value: unknown,
  path: Path,
  text: TextPolicy,
): void => {
  const at = [...path, index];
  if (Array.isArray(value))
    fillList(list.insertContainer(index, new LoroList()), value, at, text);
  else if (typeof value === "string" && text(at))
    list.insertContainer(index, new LoroText()).insert(0, value);
  else if (isRecord(value))
    fillMap(list.insertContainer(index, new LoroMap()), value, at, text);
  else list.insert(index, value);
};

const fillMap = (
  map: LoroMap,
  object: Record<string, unknown>,
  path: Path,
  text: TextPolicy,
): void => {
  for (const [key, value] of Object.entries(object))
    setMapEntry(map, key, value, path, text);
};

const fillList = (
  list: LoroList,
  array: unknown[],
  path: Path,
  text: TextPolicy,
): void => {
  array.forEach((value, index) =>
    insertListItem(list, index, value, path, text),
  );
};

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
