import { applyStringChanges } from "./apply.js";
import { ChangeType, type ListChange, type RecordChange } from "./change.js";
import { getChanges } from "./diff.js";
import { isRecord, PROTO_KEY } from "./json.js";

/** Whether `value`, an object, is plain: its prototype is `Object.prototype` or `null`. */
const isPlain = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Returns `value` as the store may hold it: every object that is not plain is replaced by a plain
 * object of its own entries, and own `__proto__` keys are left out, at any depth. Arrays and
 * binary values (`ArrayBuffer` views) stay what they are. Only the containers on a path to such
 * an object or key are copied.
 *
 * A library that builds objects by assignment, as Yjs and Loro do in `toJSON`, turns a peer's
 * `__proto__` entry into the prototype of the object holding it, so its entries would read as
 * inherited properties of the store's state. A store that copies an object by assignment, as
 * `Object.assign` does, would do the same with an own `__proto__` key.
 */
const toPlain = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || ArrayBuffer.isView(value))
    return value;

  const source = value as Record<string, unknown>;
  let copy = Array.isArray(value) || isPlain(value) ? undefined : copyOf(value);
  for (const key of Object.keys(source)) {
    if (key === PROTO_KEY) delete (copy ??= copyOf(value))[key];
    else {
      const item = toPlain(source[key]);
      if (item !== source[key]) (copy ??= copyOf(value))[key] = item;
    }
  }

  return copy ?? value;
};

/** A copy of an array or object of its own entries; an object's copy is a plain object. */
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
        revised.splice(change.key, 0, toPlain(change.value));
        break;

      case ChangeType.UPDATE:
        revised[change.key] = toPlain(change.value);
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
        revised[change.key] = toPlain(change.value);
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
 * Returns `next`, reusing every subtree of `previous` it leaves unchanged, without `__proto__`
 * keys: built from `previous` by applying the edit script `getChanges` finds between them, so
 * only the containers along a changed path are new, and an item that shifts in a list, such as
 * after an insert at the top, keeps its identity. Neither input is mutated.
 *
 * When nothing changed, `previous` itself is returned; when the two are of different kinds,
 * `next` is. Every value taken from `next` is plain: own `__proto__` keys are left out at any
 * depth, and an object whose prototype is neither `Object.prototype` nor `null` is replaced by a
 * plain object of its own entries. Arrays and binary values (`ArrayBuffer` views) are kept.
 *
 * The sync engine builds the store's next state with it, so a store re-renders only what a
 * remote change touched. Use it to write a whole state, such as a restored one, the same way.
 *
 * @example
 * ```ts
 * const previous = { todos: [{ id: "1" }], filter: "all" };
 * const next = keepIdentity(previous, { todos: [{ id: "0" }, { id: "1" }], filter: "all" });
 * next.todos[1] === previous.todos[0]; // true
 * ```
 */
export const keepIdentity = <T>(previous: T, next: T): T => {
  const a: unknown = previous;
  const b: unknown = next;
  if (typeof a === "string" && typeof b === "string") {
    const changes = getChanges(a, b);
    return changes.length === 0
      ? previous
      : (applyStringChanges(a, changes) as T);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const changes = getChanges(a, b);
    return changes.length === 0
      ? previous
      : (applyChangesToArray(a, changes) as T);
  }
  if (isRecord(a) && isRecord(b)) {
    const changes = getChanges(a, b);
    return changes.length === 0
      ? previous
      : (applyChangesToObject(a, changes) as T);
  }
  // Values of different kinds have no edit script, so `next` replaces `previous` whole.
  return toPlain(next) as T;
};
