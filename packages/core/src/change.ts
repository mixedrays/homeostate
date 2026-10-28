/**
 * The type of one step of an edit script.
 */
export const ChangeType = {
  /** A value was inserted. */
  INSERT: "insert",
  /** A value was replaced. */
  UPDATE: "update",
  /** A value was deleted. */
  DELETE: "delete",
  /** The value requires a recursive diff to identify further changes. */
  PENDING: "pending",
} as const;
export type ChangeType = (typeof ChangeType)[keyof typeof ChangeType];

/** How `applyChanges` edits a container: by key, by position, or by character. */
export type ContainerKind = "record" | "list" | "text";

/**
 * Edits the existing container at `key` in place by the nested script `changes`, of the kind
 * `kind` names, rather than replacing it.
 */
type PendingChange<K extends string | number> =
  | { type: "pending"; key: K; kind: "record"; changes: RecordChange[] }
  | { type: "pending"; key: K; kind: "list"; changes: ListChange[] }
  | { type: "pending"; key: K; kind: "text"; changes: TextChange[] };

/**
 * One step of a record's edit script. `key` is a property name. An insert or update carries
 * the new `value`, a delete only the key.
 */
export type RecordChange =
  | { type: "insert" | "update"; key: string; value: unknown }
  | { type: "delete"; key: string; count?: never }
  | PendingChange<string>;

/**
 * One step of an array's edit script. `key` is an index into the array as revised by the steps
 * before it, so appliers never sort or clamp. An insert or update carries one item as `value`;
 * a delete removes `count` items at `key`, and one when `count` is absent.
 */
export type ListChange =
  | { type: "insert" | "update"; key: number; value: unknown }
  | { type: "delete"; key: number; count?: number }
  | PendingChange<number>;

/**
 * One step of a string's edit script. `key` is an offset into the string as revised by the
 * steps before it. An insert carries a run of characters as `value`; a delete removes `count`
 * units at `key`, and one when `count` is absent.
 *
 * Offsets and counts use UTF-16 code units. Generated edits preserve code point boundaries: a
 * supplementary character is deleted whole, never split between two steps. These are not
 * grapheme edits; combining marks and joined emoji may span several code points.
 */
export type TextChange =
  | { type: "insert"; key: number; value: string }
  | { type: "delete"; key: number; count?: number };

/**
 * One step in turning a container into another. Narrow it by `type`, and a pending step's
 * script by `kind`.
 *
 * `getChanges` sets `count` on every array and string delete, one included, and merges
 * consecutive deletes at one index into one step.
 */
export type Change = RecordChange | ListChange | TextChange;

/** The ordered steps that turn a record, an array or a string into another of its kind. */
export type EditScript = RecordChange[] | ListChange[] | TextChange[];
