import { LoroList, LoroMap, LoroText } from 'loro-crdt';

export type SharedContainer = LoroMap | LoroList | LoroText;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const setMapEntry = (map: LoroMap, key: string, value: unknown): void => {
  if (Array.isArray(value)) fillList(map.setContainer(key, new LoroList()), value);
  else if (typeof value === 'string') map.setContainer(key, new LoroText()).insert(0, value);
  else if (isRecord(value)) fillMap(map.setContainer(key, new LoroMap()), value);
  else map.set(key, value);
};

export const insertListItem = (list: LoroList, index: number, value: unknown): void => {
  if (Array.isArray(value)) fillList(list.insertContainer(index, new LoroList()), value);
  else if (typeof value === 'string') list.insertContainer(index, new LoroText()).insert(0, value);
  else if (isRecord(value)) fillMap(list.insertContainer(index, new LoroMap()), value);
  else list.insert(index, value);
};

export const fillMap = (map: LoroMap, object: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(object)) setMapEntry(map, key, value);
};

export const fillList = (list: LoroList, array: unknown[]): void => {
  array.forEach((value, index) => insertListItem(list, index, value));
};
