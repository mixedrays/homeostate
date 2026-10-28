import { applyStringChanges } from "./apply.js";
import { ChangeType, type ListChange, type RecordChange } from "./change.js";
import { getChanges, isRecord, PROTO_KEY } from "./diff.js";

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

/** The value the pending step `change` leaves at its key, given the value there now. */
const applyPending = (
  current: unknown,
  change: Extract<RecordChange | ListChange, { type: "pending" }>,
): unknown => {
  // The diff found a container of `change.kind` at its key.
  if (change.kind === "text")
    return applyStringChanges(current as string, change.changes);
  if (change.kind === "list")
    return applyChangesToArray(current as unknown[], change.changes);
  return applyChangesToObject(
    current as Record<string, unknown>,
    change.changes,
  );
};

const applyChangesToArray = (
  array: unknown[],
  changes: ListChange[],
): unknown[] => {
  const revised = [...array];

  for (const change of changes) {
    switch (change.type) {
      case ChangeType.INSERT:
        revised.splice(change.key, 0, withoutProtoKeys(change.value));
        break;

      case ChangeType.UPDATE:
        revised[change.key] = withoutProtoKeys(change.value);
        break;

      case ChangeType.PENDING:
        revised[change.key] = applyPending(revised[change.key], change);
        break;

      case ChangeType.DELETE:
        revised.splice(change.key, change.count ?? 1);
        break;
    }
  }

  return revised;
};

const applyChangesToObject = (
  object: Record<string, unknown>,
  changes: RecordChange[],
): Record<string, unknown> => {
  const revised = { ...object };

  for (const change of changes) {
    switch (change.type) {
      case ChangeType.INSERT:
      case ChangeType.UPDATE:
        revised[change.key] = withoutProtoKeys(change.value);
        break;

      case ChangeType.PENDING:
        revised[change.key] = applyPending(object[change.key], change);
        break;

      case ChangeType.DELETE:
        delete revised[change.key];
        break;
    }
  }

  return revised;
};

/**
 * Returns a value identical to newState, built from oldState by copying every
 * container along a changed path and sharing every unchanged subtree. Neither
 * input is mutated. If oldState and newState are already identical (indicated
 * by an empty diff), then oldState itself is returned; if they are of different
 * kinds, newState is. Own `__proto__` keys in newState are left out at any depth.
 *
 * @param oldState The state we want to patch.
 * @param newState The state we want the result to match.
 *
 * @returns The patched state, identical to newState.
 */
export const patchState = <T>(oldState: T, newState: T): T => {
  const a: unknown = oldState;
  const b: unknown = newState;
  if (typeof a === "string" && typeof b === "string") {
    const changes = getChanges(a, b);
    return changes.length === 0
      ? oldState
      : (applyStringChanges(a, changes) as T);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const changes = getChanges(a, b);
    return changes.length === 0
      ? oldState
      : (applyChangesToArray(a, changes) as T);
  }
  if (isRecord(a) && isRecord(b)) {
    const changes = getChanges(a, b);
    return changes.length === 0
      ? oldState
      : (applyChangesToObject(a, changes) as T);
  }
  // Values of different kinds have no edit script, so newState replaces oldState whole.
  return withoutProtoKeys(newState) as T;
};
