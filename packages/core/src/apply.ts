import {
  ChangeType,
  type ContainerKind,
  type ListChange,
  type RecordChange,
  type TextChange,
} from "./change.js";
import { getChanges, isRecord, type DiffOptions } from "./diff.js";
import { toJsonValue } from "./json.js";

export type { ContainerKind } from "./change.js";

type Path = readonly (string | number)[];

/**
 * How one store or document writes into its containers. `applyChanges` decides *what* to write;
 * an implementation of this decides *how*, so the same edit script drives a Y.Map, an Automerge
 * document, a MobX observable tree, a Valtio proxy, or a plain object.
 *
 * Every container passed in already lives in the target, never a copy. `path` is that
 * container's path from the target, so a backend can convert the values it writes per path, as
 * a text policy needs.
 */
export interface ApplyOps {
  /**
   * What `value`, the target or a child read with `get`, is to the walk: a container it edits in
   * place, or `undefined` for a plain value, which it replaces whole.
   */
  kind(value: unknown): ContainerKind | undefined;
  /** The child at `key` of the record or list `container`. */
  get(container: object, key: string | number): unknown;
  /** Assign `value` at `key` of the record or list `container`, creating a record property. */
  set(
    container: object,
    key: string | number,
    value: unknown,
    path: Path,
  ): void;
  /** Remove the property `key` of the record `container`. */
  remove(container: object, key: string, path: Path): void;
  /** `Array.prototype.splice` on the list `container`: drop `deleteCount` items at `index`, then add `inserted`. */
  splice(
    list: object,
    index: number,
    deleteCount: number,
    inserted: unknown[],
    path: Path,
  ): void;
  /**
   * Delete `deleteCount` UTF-16 units at `index` of the text `text`, then insert `inserted` there.
   * `path` is the text's own path. Omit it for a store without text: `kind` then never returns
   * `"text"`, and a text it does return is replaced whole.
   */
  editText?(
    text: unknown,
    index: number,
    deleteCount: number,
    inserted: string,
    path: Path,
  ): void;
}

/**
 * Revises `value` by the character-level edit script `changes`, which is what `getChanges`
 * returns for two strings. Each index addresses the string as revised by the steps before it.
 * Offsets and deletion counts are UTF-16 units; an absent count means one unit.
 */
export const applyStringChanges = (
  value: string,
  changes: TextChange[],
): string =>
  changes.reduce((revised, change) => {
    const at = change.key;
    if (change.type === ChangeType.INSERT)
      return revised.slice(0, at) + change.value + revised.slice(at);
    if (change.type === ChangeType.DELETE)
      return revised.slice(0, at) + revised.slice(at + (change.count ?? 1));
    return revised;
  }, value);

/** A pending step of a record's or a list's script. */
type Pending = Extract<RecordChange | ListChange, { type: "pending" }>;

/**
 * Applies the pending step `change` to the child at its key of `container`, whose next value is
 * `next`. The child is edited in place when it is the kind of container the step's script edits;
 * any other child, such as a string held as a plain value or a plain value other code stored, is
 * replaced whole by its next value.
 */
const walkPending = (
  container: object,
  change: Pending,
  next: unknown,
  path: Path,
  ops: ApplyOps,
  options: DiffOptions,
): void => {
  const { key } = change;
  // Steps before a pending one are final, so `key` is also its index in `next`.
  const nextChild = (next as Record<string | number, unknown>)[key];
  const child = ops.get(container, key);
  const at = [...path, key];
  if (ops.kind(child) === change.kind) {
    if (change.kind === "record")
      return walkRecord(
        child as object,
        change.changes,
        nextChild,
        at,
        ops,
        options,
      );
    if (change.kind === "list")
      return walkList(
        child as object,
        change.changes,
        nextChild,
        at,
        ops,
        options,
      );
    if (ops.editText !== undefined) {
      for (const step of change.changes)
        if (step.type === ChangeType.INSERT)
          ops.editText(child, step.key, 0, step.value, at);
        else ops.editText(child, step.key, step.count ?? 1, "", at);
      return;
    }
  }
  ops.set(
    container,
    key,
    options.json ? toJsonValue(nextChild) : nextChild,
    path,
  );
};

/** Applies a record's script `changes` to `record`, whose next value is `next`. */
const walkRecord = (
  record: object,
  changes: RecordChange[],
  next: unknown,
  path: Path,
  ops: ApplyOps,
  options: DiffOptions,
): void => {
  for (const change of changes) {
    if (change.type === ChangeType.PENDING)
      walkPending(record, change, next, path, ops, options);
    else if (change.type === ChangeType.DELETE)
      ops.remove(record, change.key, path);
    else ops.set(record, change.key, change.value, path);
  }
};

/** Applies a list's script `changes` to `list`, whose next value is `next`. */
const walkList = (
  list: object,
  changes: ListChange[],
  next: unknown,
  path: Path,
  ops: ApplyOps,
  options: DiffOptions,
): void => {
  for (const change of changes) {
    switch (change.type) {
      case ChangeType.PENDING:
        walkPending(list, change, next, path, ops, options);
        break;
      case ChangeType.DELETE:
        ops.splice(list, change.key, change.count ?? 1, [], path);
        break;
      case ChangeType.INSERT:
        ops.splice(list, change.key, 0, [change.value], path);
        break;
      case ChangeType.UPDATE:
        ops.set(list, change.key, change.value, path);
        break;
    }
  }
};

/**
 * Makes `target` equal to `next` in place, writing only what differs from `current`, the plain
 * JSON `target` holds. Everything else keeps its identity, which is what fine-grained stores
 * react to and what keeps a CRDT update small.
 *
 * @param target The record or list to mutate.
 * @param current What `target` holds now, as plain JSON.
 * @param next What `target` should hold.
 * @param ops How this store or document writes; see {@link ApplyOps}.
 * @param options Passed to `getChanges`.
 */
export const applyChanges = (
  target: object,
  current: object,
  next: object,
  ops: ApplyOps,
  options: DiffOptions = {},
): void => {
  const kind = ops.kind(target);
  if (kind === "record" && isRecord(current) && isRecord(next))
    walkRecord(
      target,
      getChanges(current, next, options),
      next,
      [],
      ops,
      options,
    );
  else if (kind === "list" && Array.isArray(current) && Array.isArray(next))
    walkList(
      target,
      getChanges(current, next, options),
      next,
      [],
      ops,
      options,
    );
};
