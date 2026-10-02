import { applyStringChanges } from "./apply.js";
import { ChangeType, type Change } from "./change.js";
import { getChanges, PROTO_KEY, type Diffable } from "./diff.js";

const isContainer = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    Array.isArray(value) || prototype === Object.prototype || prototype === null
  );
};

/**
 * Returns `value` without own `__proto__` keys in any array or plain object, copying only the
 * containers on a path to one. A store that copies such an object by assignment, as
 * `Object.assign` does, would hand the key's value to the copy as its prototype.
 */
const withoutProtoKeys = (value: unknown): unknown => {
  if (!isContainer(value)) return value;

  let copy: Record<string, unknown> | undefined;
  for (const key of Object.keys(value)) {
    if (key === PROTO_KEY) delete (copy ??= copyOf(value))[key];
    else {
      const item = withoutProtoKeys(value[key]);
      if (item !== value[key]) (copy ??= copyOf(value))[key] = item;
    }
  }

  return copy ?? value;
};

const copyOf = (value: object): Record<string, unknown> =>
  (Array.isArray(value) ? [...value] : { ...value }) as Record<string, unknown>;

const applyChanges = (state: Diffable, changes: Change[]): Diffable => {
  if (typeof state === "string") return applyStringChanges(state, changes);
  if (Array.isArray(state)) return applyChangesToArray(state, changes);
  return applyChangesToObject(state, changes);
};

const applyChangesToArray = (
  array: unknown[],
  changes: Change[],
): unknown[] => {
  const revised = [...array];

  for (const [type, index, value] of changes) {
    const i = index as number;

    switch (type) {
      case ChangeType.INSERT:
        revised.splice(i, 0, withoutProtoKeys(value));
        break;

      case ChangeType.UPDATE:
        revised[i] = withoutProtoKeys(value);
        break;

      case ChangeType.PENDING:
        revised[i] = applyChanges(revised[i] as Diffable, value as Change[]);
        break;

      case ChangeType.DELETE:
        revised.splice(i, 1);
        break;
    }
  }

  return revised;
};

const applyChangesToObject = (
  object: Record<string, unknown>,
  changes: Change[],
): Record<string, unknown> => {
  const revised = { ...object };

  for (const [type, property, value] of changes) {
    const key = property as string;

    switch (type) {
      case ChangeType.INSERT:
      case ChangeType.UPDATE:
        revised[key] = withoutProtoKeys(value);
        break;

      case ChangeType.PENDING:
        revised[key] = applyChanges(object[key] as Diffable, value as Change[]);
        break;

      case ChangeType.DELETE:
        delete revised[key];
        break;
    }
  }

  return revised;
};

/**
 * Returns a value identical to newState, built from oldState by copying every
 * container along a changed path and sharing every unchanged subtree. Neither
 * input is mutated. If oldState and newState are already identical (indicated
 * by an empty diff), then oldState itself is returned. Own `__proto__` keys in
 * newState are left out at any depth.
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
