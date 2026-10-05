import * as Y from "yjs";
import {
  applyStringChanges,
  ChangeType,
  getChanges,
  type Change,
  type Diffable,
  type TextPolicy,
} from "@homeostate/core";
import { toSharedType, type Path, type SharedType } from "./mapping.js";

/**
 * Diffs sharedType against newState once and applies the resulting changes, recursing
 * into nested Y.Maps, Y.Arrays, and Y.Texts for every pending entry. newState is diffed as
 * JSON would store it, and every change is found before any is applied, so no change is
 * applied unless all of them can be.
 *
 * Strings the policy marks as text are edited character by character in Y.Texts; any other
 * string is replaced whole as a plain value. A string held as the other kind becomes the
 * configured one when it next changes.
 *
 * @param sharedType The Yjs shared type to patch.
 * @param newState The new state to patch the shared type into.
 * @param text Which strings, by path from sharedType, are Y.Texts.
 */
export const patchSharedType = (
  sharedType: SharedType,
  newState: unknown,
  text: TextPolicy,
): void => {
  applyChanges(
    sharedType,
    getChanges(sharedType.toJSON() as Diffable, newState as Diffable, {
      text,
      json: true,
    }),
    [],
    text,
  );
};

const applyChanges = (
  sharedType: SharedType,
  changes: Change[],
  path: Path,
  text: TextPolicy,
): void => {
  for (const [type, key, value] of changes) {
    if (sharedType instanceof Y.Map)
      applyToMap(sharedType, type, key as string, value, path, text);
    else if (sharedType instanceof Y.Array)
      applyToArray(sharedType, type, key as number, value, path, text);
    else applyToText(sharedType, type, key as number, value);
  }
};

const applyToMap = (
  map: Y.Map<unknown>,
  type: ChangeType,
  key: string,
  value: unknown,
  path: Path,
  text: TextPolicy,
): void => {
  const at = [...path, key];
  switch (type) {
    case ChangeType.INSERT:
    case ChangeType.UPDATE:
      map.set(key, toSharedType(value, at, text));
      break;

    case ChangeType.DELETE:
      map.delete(key);
      break;

    case ChangeType.PENDING: {
      const child = map.get(key);
      // Text held as a plain string, by a peer with another policy or an older version.
      if (typeof child === "string")
        map.set(
          key,
          toSharedType(applyStringChanges(child, value as Change[]), at, text),
        );
      else applyChanges(child as SharedType, value as Change[], at, text);
      break;
    }
  }
};

const applyToArray = (
  array: Y.Array<unknown>,
  type: ChangeType,
  index: number,
  value: unknown,
  path: Path,
  text: TextPolicy,
): void => {
  const at = [...path, index];
  switch (type) {
    case ChangeType.INSERT:
      array.insert(index, [toSharedType(value, at, text)]);
      break;

    case ChangeType.UPDATE:
      array.delete(index);
      array.insert(index, [toSharedType(value, at, text)]);
      break;

    case ChangeType.DELETE:
      array.delete(index);
      break;

    case ChangeType.PENDING: {
      const child = array.get(index);
      if (typeof child === "string") {
        array.delete(index);
        array.insert(index, [
          toSharedType(applyStringChanges(child, value as Change[]), at, text),
        ]);
      } else applyChanges(child as SharedType, value as Change[], at, text);
      break;
    }
  }
};

const applyToText = (
  text: Y.Text,
  type: ChangeType,
  index: number,
  value: unknown,
): void => {
  if (type === ChangeType.INSERT) text.insert(index, value as string);
  else if (type === ChangeType.DELETE)
    text.delete(index, typeof value === "number" ? value : 1);
};
