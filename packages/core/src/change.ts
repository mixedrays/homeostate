/**
 * Describes the change that needs to be made.
 */
export enum ChangeType {
  /** A value was inserted. */
  INSERT = "insert",
  /** A value was replaced. */
  UPDATE = "update",
  /** A value was deleted. */
  DELETE = "delete",
  /** The value requires a recursive diff to identify further changes. */
  PENDING = "pending",
}

/**
 * One step in turning a container into another: `[type, key, value]`.
 *
 * Steps apply in order. A numeric key addresses the array or string as revised by the
 * steps before it, so appliers never sort or clamp. `value` is the inserted or replacing
 * value (a string insert may carry several characters), and the nested `Change[]` for a
 * pending entry. Object and array deletes carry `undefined`.
 *
 * String offsets and deletion lengths use UTF-16 code units. A string delete carries its
 * length in `value`, or `undefined` for the default length of 1. Generated string edits
 * preserve code point boundaries: deleting a supplementary character is one step with
 * length 2, never two steps that split its surrogate pair. These are not grapheme edits;
 * combining marks and joined emoji may span multiple code points.
 */
export type Change = [ChangeType, string | number, unknown];
