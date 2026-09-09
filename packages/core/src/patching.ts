import * as Y from 'yjs';
import { ChangeType, type Change } from './change.js';
import { getChanges } from './diff.js';
import { arrayToYArray, objectToYMap, stringToYText } from './mapping.js';

/**
 * Diffs sharedType and newState to create a list of changes for transforming
 * the contents of sharedType into that of newState. For every nested, 'pending'
 * change detected, this function recurses, as a nested object or array is
 * represented as a Y.Map or Y.Array.
 *
 * @param sharedType The Yjs shared type to patch.
 * @param newState The new state to patch the shared type into.
 */
export const patchSharedType = (
  sharedType: Y.Map<unknown> | Y.Array<unknown> | Y.Text,
  newState: unknown
): void => {
  const changes = getChanges(
    sharedType.toJSON() as Record<string, unknown> | unknown[] | string, 
    newState as Record<string, unknown> | unknown[] | string
  );

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
            sharedType.get(property as string) as Y.Map<unknown> | Y.Array<unknown> | Y.Text,
            (newState as Record<string, unknown>)[property as string]
          );
        } else if (sharedType instanceof Y.Array) {
          patchSharedType(
            sharedType.get(property as number) as Y.Map<unknown> | Y.Array<unknown> | Y.Text,
            (newState as unknown[])[property as number]
          );
        }
        break;

      default:
        break;
    }
  });
};

/**
 * Patches oldState to be identical to newState. This function recurses when
 * an array or object is encountered. If oldState and newState are already
 * identical (indicated by an empty diff), then oldState is returned.
 *
 * @param oldState The state we want to patch.
 * @param newState The state we want oldState to match after patching.
 *
 * @returns The patched oldState, identical to newState.
 */
export const patchState = <T>(oldState: T, newState: T): T => {
  const changes = getChanges(
    oldState as Record<string, unknown> | unknown[] | string,
    newState as Record<string, unknown> | unknown[] | string
  );

  const applyChanges = (
    state: string | unknown[] | Record<string, unknown>,
    changes: Change[]
  ): unknown => {
    if (typeof state === 'string')
      return applyChangesToString(state as string, changes);
    else if (state instanceof Array)
      return applyChangesToArray(state as unknown[], changes);
    else if (state instanceof Object)
      return applyChangesToObject(state as Record<string, unknown>, changes);
  };

  const applyChangesToArray = (array: unknown[], changes: Change[]): unknown[] =>
    changes
      .sort(([, indexA], [, indexB]) =>
        Math.sign((indexA as number) - (indexB as number))
      )
      .reduce((revisedArray, [type, index, value]) => {
        switch (type) {
          case ChangeType.INSERT: {
            revisedArray.splice(index as number, 0, value);
            return revisedArray;
          }

          case ChangeType.UPDATE: {
            revisedArray[index as number] = value;
            return revisedArray;
          }

          case ChangeType.PENDING: {
            revisedArray[index as number] = applyChanges(
              array[index as number] as string | unknown[] | Record<string, unknown>,
              value as Change[]
            );
            return revisedArray;
          }

          case ChangeType.DELETE: {
            revisedArray.splice(index as number, 1);
            return revisedArray;
          }

          case ChangeType.NONE:
          default:
            return revisedArray;
        }
      }, array);

  const applyChangesToObject = (
    object: Record<string, unknown>,
    changes: Change[]
  ): Record<string, unknown> =>
    changes.reduce((revisedObject, [type, property, value]) => {
      switch (type) {
        case ChangeType.INSERT:
        case ChangeType.UPDATE: {
          revisedObject[property as string] = value;
          return revisedObject;
        }

        case ChangeType.PENDING: {
          revisedObject[property as string] = applyChanges(
            object[property as string] as string | unknown[] | Record<string, unknown>,
            value as Change[]
          );
          return revisedObject;
        }

        case ChangeType.DELETE: {
          delete revisedObject[property as string];
          return revisedObject;
        }

        case ChangeType.NONE:
        default:
          return revisedObject;
      }
    }, object);

  const applyChangesToString = (string: string, changes: Change[]): string =>
    changes.reduce((revisedString, [type, index, value]) => {
      switch (type) {
        case ChangeType.INSERT: {
          const left = revisedString.slice(0, index as number);
          const right = revisedString.slice(index as number);
          return left + (value as string) + right;
        }

        case ChangeType.DELETE: {
          const left = revisedString.slice(0, index as number);
          const right = revisedString.slice((index as number) + 1);
          return left + right;
        }

        default: {
          return revisedString;
        }
      }
    }, string);

  if (changes.length === 0) return oldState;
  else return applyChanges(
    oldState as string | unknown[] | Record<string, unknown>,
    changes
  ) as T;
};
