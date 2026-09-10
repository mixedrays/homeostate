/**
 * Describes the change that needs to be made.
 */
export enum ChangeType {
  /** A value was inserted. */
  INSERT = 'insert',
  /** A value was replaced. */
  UPDATE = 'update',
  /** A value was deleted. */
  DELETE = 'delete',
  /** The value requires a recursive diff to identify further changes. */
  PENDING = 'pending',
}

/**
 * One step in turning a container into another: `[type, key, value]`.
 *
 * Steps apply in order. A numeric key addresses the array or string as revised by the
 * steps before it, so appliers never sort or clamp. `value` is the inserted or replacing
 * value (a string insert may carry several characters), `undefined` for a delete, and the
 * nested `Change[]` for a pending entry.
 */
export type Change = [ChangeType, string | number, unknown];
