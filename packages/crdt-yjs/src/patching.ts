import * as Y from 'yjs';
import { ChangeType, getChanges, type Change, type Diffable } from '@homeostate/core';
import { toSharedType, type SharedType } from './mapping.js';

/**
 * Diffs sharedType against newState once and applies the resulting changes, recursing
 * into nested Y.Maps, Y.Arrays, and Y.Texts for every pending entry.
 *
 * @param sharedType The Yjs shared type to patch.
 * @param newState The new state to patch the shared type into.
 */
export const patchSharedType = (sharedType: SharedType, newState: unknown): void => {
  applyChanges(sharedType, getChanges(sharedType.toJSON() as Diffable, newState as Diffable));
};

const applyChanges = (sharedType: SharedType, changes: Change[]): void => {
  for (const [type, key, value] of changes) {
    if (sharedType instanceof Y.Map) applyToMap(sharedType, type, key as string, value);
    else if (sharedType instanceof Y.Array) applyToArray(sharedType, type, key as number, value);
    else applyToText(sharedType, type, key as number, value);
  }
};

const applyToMap = (map: Y.Map<unknown>, type: ChangeType, key: string, value: unknown): void => {
  switch (type) {
    case ChangeType.INSERT:
    case ChangeType.UPDATE:
      map.set(key, toSharedType(value));
      break;

    case ChangeType.DELETE:
      map.delete(key);
      break;

    case ChangeType.PENDING:
      applyChanges(map.get(key) as SharedType, value as Change[]);
      break;
  }
};

const applyToArray = (
  array: Y.Array<unknown>,
  type: ChangeType,
  index: number,
  value: unknown
): void => {
  switch (type) {
    case ChangeType.INSERT:
      array.insert(index, [toSharedType(value)]);
      break;

    case ChangeType.UPDATE:
      array.delete(index);
      array.insert(index, [toSharedType(value)]);
      break;

    case ChangeType.DELETE:
      array.delete(index);
      break;

    case ChangeType.PENDING:
      applyChanges(array.get(index) as SharedType, value as Change[]);
      break;
  }
};

const applyToText = (text: Y.Text, type: ChangeType, index: number, value: unknown): void => {
  if (type === ChangeType.INSERT) text.insert(index, value as string);
  else if (type === ChangeType.DELETE) text.delete(index, 1);
};
