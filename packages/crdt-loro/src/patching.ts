import { LoroList, LoroMap, LoroText } from "loro-crdt";
import {
  ChangeType,
  getChanges,
  toJsonValue,
  type Change,
  type Diffable,
} from "@homeostate/core";
import {
  insertListItem,
  setMapEntry,
  type SharedContainer,
} from "./mapping.js";

/**
 * Diffs container against newState once and applies the resulting changes. newState is first
 * reduced to what JSON can hold, so no change is applied unless all of them can be.
 */
export const patchContainer = (
  container: SharedContainer,
  newState: unknown,
): void => {
  applyChanges(
    container,
    getChanges(
      container.toJSON() as Diffable,
      toJsonValue(newState) as Diffable,
    ),
  );
};

const applyChanges = (container: SharedContainer, changes: Change[]): void => {
  for (const [type, key, value] of changes) {
    if (container instanceof LoroMap)
      applyToMap(container, type, key as string, value);
    else if (container instanceof LoroList)
      applyToList(container, type, key as number, value);
    else applyToText(container, type, key as number, value);
  }
};

const applyToMap = (
  map: LoroMap,
  type: ChangeType,
  key: string,
  value: unknown,
): void => {
  switch (type) {
    case ChangeType.INSERT:
    case ChangeType.UPDATE:
      setMapEntry(map, key, value);
      break;

    case ChangeType.DELETE:
      map.delete(key);
      break;

    case ChangeType.PENDING:
      applyChanges(map.get(key) as SharedContainer, value as Change[]);
      break;
  }
};

const applyToList = (
  list: LoroList,
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  switch (type) {
    case ChangeType.INSERT:
      insertListItem(list, index, value);
      break;

    case ChangeType.UPDATE:
      list.delete(index, 1);
      insertListItem(list, index, value);
      break;

    case ChangeType.DELETE:
      list.delete(index, 1);
      break;

    case ChangeType.PENDING:
      applyChanges(list.get(index) as SharedContainer, value as Change[]);
      break;
  }
};

const applyToText = (
  text: LoroText,
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  if (type === ChangeType.INSERT) text.insert(index, value as string);
  else if (type === ChangeType.DELETE)
    text.delete(index, typeof value === "number" ? value : 1);
};
