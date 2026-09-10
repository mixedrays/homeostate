import * as Y from 'yjs';
import { ChangeType, getChanges, type Diffable } from '@homeostate/core';
import { arrayToYArray, objectToYMap, stringToYText } from './mapping.js';

type SharedType = Y.Map<unknown> | Y.Array<unknown> | Y.Text;

/**
 * Diffs sharedType and newState to create a list of changes for transforming
 * the contents of sharedType into that of newState. For every nested, 'pending'
 * change detected, this function recurses, as a nested object or array is
 * represented as a Y.Map or Y.Array.
 *
 * @param sharedType The Yjs shared type to patch.
 * @param newState The new state to patch the shared type into.
 */
export const patchSharedType = (sharedType: SharedType, newState: unknown): void => {
  const changes = getChanges(sharedType.toJSON() as Diffable, newState as Diffable);

  changes.forEach(([type, property, value]) => {
    switch (type) {
      case ChangeType.INSERT:
      case ChangeType.UPDATE:
        if (value instanceof Function === false) {
          if (sharedType instanceof Y.Map) {
            if (typeof value === 'string')
              sharedType.set(property as string, stringToYText(value));
            else if (value instanceof Array)
              sharedType.set(property as string, arrayToYArray(value));
            else if (value instanceof Object)
              sharedType.set(property as string, objectToYMap(value as Record<string, unknown>));
            else sharedType.set(property as string, value);
          } else if (sharedType instanceof Y.Array) {
            const index = property as number;

            if (type === ChangeType.UPDATE) sharedType.delete(index);

            if (typeof value === 'string')
              sharedType.insert(index, [stringToYText(value)]);
            else if (value instanceof Array)
              sharedType.insert(index, [arrayToYArray(value)]);
            else if (value instanceof Object)
              sharedType.insert(index, [objectToYMap(value as Record<string, unknown>)]);
            else sharedType.insert(index, [value]);
          } else if (sharedType instanceof Y.Text)
            sharedType.insert(property as number, value as string);
        }
        break;

      case ChangeType.DELETE:
        if (sharedType instanceof Y.Map) sharedType.delete(property as string);
        else if (sharedType instanceof Y.Array) {
          const index = property as number;
          sharedType.delete(
            sharedType.length <= index ? sharedType.length - 1 : index
          );
        } else if (sharedType instanceof Y.Text)
          // A delete operation for text is only ever for a single character.
          sharedType.delete(property as number, 1);

        break;

      case ChangeType.PENDING:
        if (sharedType instanceof Y.Map) {
          patchSharedType(
            sharedType.get(property as string) as SharedType,
            (newState as Record<string, unknown>)[property as string]
          );
        } else if (sharedType instanceof Y.Array) {
          patchSharedType(
            sharedType.get(property as number) as SharedType,
            (newState as unknown[])[property as number]
          );
        }
        break;

      default:
        break;
    }
  });
};
