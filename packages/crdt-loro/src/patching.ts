import { LoroList, LoroMap, LoroText } from "loro-crdt";
import {
  applyStringChanges,
  ChangeType,
  getChanges,
  toJsonValue,
  type Change,
  type Diffable,
  type TextPolicy,
} from "@homeostate/core";
import {
  insertListItem,
  setMapEntry,
  type Path,
  type SharedContainer,
} from "./mapping.js";

/**
 * Diffs container against newState once and applies the resulting changes. newState is first
 * reduced to what JSON can hold, so no change is applied unless all of them can be.
 *
 * Strings the policy marks as text are edited character by character in LoroTexts; any other
 * string is replaced whole as a plain value. A string held as the other kind becomes the
 * configured one when it next changes.
 */
export const patchContainer = (
  container: SharedContainer,
  newState: unknown,
  text: TextPolicy,
): void => {
  applyChanges(
    container,
    getChanges(
      container.toJSON() as Diffable,
      toJsonValue(newState) as Diffable,
      { text },
    ),
    [],
    text,
  );
};

const applyChanges = (
  container: SharedContainer,
  changes: Change[],
  path: Path,
  text: TextPolicy,
): void => {
  for (const [type, key, value] of changes) {
    if (container instanceof LoroMap)
      applyToMap(container, type, key as string, value, path, text);
    else if (container instanceof LoroList)
      applyToList(container, type, key as number, value, path, text);
    else applyToText(container, type, key as number, value);
  }
};

const applyToMap = (
  map: LoroMap,
  type: ChangeType,
  key: string,
  value: unknown,
  path: Path,
  text: TextPolicy,
): void => {
  switch (type) {
    case ChangeType.INSERT:
    case ChangeType.UPDATE:
      setMapEntry(map, key, value, path, text);
      break;

    case ChangeType.DELETE:
      map.delete(key);
      break;

    case ChangeType.PENDING: {
      const child = map.get(key);
      // Text held as a plain string, by a peer with another policy or an older version.
      if (typeof child === "string")
        setMapEntry(
          map,
          key,
          applyStringChanges(child, value as Change[]),
          path,
          text,
        );
      else
        applyChanges(
          child as SharedContainer,
          value as Change[],
          [...path, key],
          text,
        );
      break;
    }
  }
};

const applyToList = (
  list: LoroList,
  type: ChangeType,
  index: number,
  value: unknown,
  path: Path,
  text: TextPolicy,
): void => {
  switch (type) {
    case ChangeType.INSERT:
      insertListItem(list, index, value, path, text);
      break;

    case ChangeType.UPDATE:
      list.delete(index, 1);
      insertListItem(list, index, value, path, text);
      break;

    case ChangeType.DELETE:
      list.delete(index, 1);
      break;

    case ChangeType.PENDING: {
      const child = list.get(index);
      if (typeof child === "string") {
        list.delete(index, 1);
        insertListItem(
          list,
          index,
          applyStringChanges(child, value as Change[]),
          path,
          text,
        );
      } else
        applyChanges(
          child as SharedContainer,
          value as Change[],
          [...path, index],
          text,
        );
      break;
    }
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
