import { ChangeType, type Change } from './change.js';
import { getChanges, type Diffable } from './diff.js';

const byIndex = ([, indexA]: Change, [, indexB]: Change): number =>
  Math.sign((indexA as number) - (indexB as number));

const applyChanges = (state: Diffable, changes: Change[]): Diffable => {
  if (typeof state === 'string') return applyChangesToString(state, changes);
  if (Array.isArray(state)) return applyChangesToArray(state, changes);
  return applyChangesToObject(state, changes);
};

const applyChangesToArray = (array: unknown[], changes: Change[]): unknown[] => {
  const revised = [...array];

  for (const [type, index, value] of [...changes].sort(byIndex)) {
    const i = index as number;

    switch (type) {
      case ChangeType.INSERT:
        revised.splice(i, 0, value);
        break;

      case ChangeType.UPDATE:
        revised[i] = value;
        break;

      case ChangeType.PENDING:
        revised[i] = applyChanges(revised[i] as Diffable, value as Change[]);
        break;

      case ChangeType.DELETE:
        revised.splice(i, 1);
        break;

      case ChangeType.NONE:
      default:
        break;
    }
  }

  return revised;
};

const applyChangesToObject = (
  object: Record<string, unknown>,
  changes: Change[]
): Record<string, unknown> => {
  const revised = { ...object };

  for (const [type, property, value] of changes) {
    const key = property as string;

    switch (type) {
      case ChangeType.INSERT:
      case ChangeType.UPDATE:
        revised[key] = value;
        break;

      case ChangeType.PENDING:
        revised[key] = applyChanges(object[key] as Diffable, value as Change[]);
        break;

      case ChangeType.DELETE:
        delete revised[key];
        break;

      case ChangeType.NONE:
      default:
        break;
    }
  }

  return revised;
};

const applyChangesToString = (string: string, changes: Change[]): string =>
  changes.reduce((revised, [type, index, value]) => {
    switch (type) {
      case ChangeType.INSERT: {
        const left = revised.slice(0, index as number);
        const right = revised.slice(index as number);
        return left + (value as string) + right;
      }

      case ChangeType.DELETE: {
        const left = revised.slice(0, index as number);
        const right = revised.slice((index as number) + 1);
        return left + right;
      }

      default: {
        return revised;
      }
    }
  }, string);

/**
 * Returns a value identical to newState, built from oldState by copying every
 * container along a changed path and sharing every unchanged subtree. Neither
 * input is mutated. If oldState and newState are already identical (indicated
 * by an empty diff), then oldState itself is returned.
 *
 * @param oldState The state we want to patch.
 * @param newState The state we want the result to match.
 *
 * @returns The patched state, identical to newState.
 */
export const patchState = <T>(oldState: T, newState: T): T => {
  const changes = getChanges(oldState as Diffable, newState as Diffable);

  if (changes.length === 0) return oldState;
  return applyChanges(oldState as Diffable, changes) as T;
};
