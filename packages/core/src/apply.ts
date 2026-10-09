import { ChangeType, type Change } from "./change.js";
import { getChanges, type Diffable, type DiffOptions } from "./diff.js";
import { toJsonValue } from "./json.js";

type Path = readonly (string | number)[];

/** How `applyChanges` edits a container: by key, by position, or by character. */
export type ContainerKind = "record" | "list" | "text";

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
 * Offsets and deletion lengths are UTF-16 units; an omitted length means one unit.
 */
export const applyStringChanges = (value: string, changes: Change[]): string =>
  changes.reduce((revised, [type, index, inserted]) => {
    const at = index as number;
    if (type === ChangeType.INSERT)
      return revised.slice(0, at) + (inserted as string) + revised.slice(at);
    if (type === ChangeType.DELETE)
      return (
        revised.slice(0, at) +
        revised.slice(at + (typeof inserted === "number" ? inserted : 1))
      );
    return revised;
  }, value);

/** The kind of container a diff edits `value` as. */
const expectedKind = (value: unknown): ContainerKind | undefined =>
  typeof value === "string"
    ? "text"
    : Array.isArray(value)
      ? "list"
      : value !== null && typeof value === "object"
        ? "record"
        : undefined;

/**
 * Applies `changes` to `container`, whose next value is `next`. A pending step edits the child
 * in place when it is the kind of container the diff expects; any other child, such as a string
 * held as a plain value or a plain value other code stored, is replaced whole by its next value.
 */
const walk = (
  container: object,
  kind: ContainerKind,
  changes: Change[],
  next: unknown,
  path: Path,
  ops: ApplyOps,
  options: DiffOptions,
): void => {
  if (kind === "text") {
    for (const [type, index, value] of changes) {
      if (type === ChangeType.INSERT)
        ops.editText?.(container, index as number, 0, value as string, path);
      else if (type === ChangeType.DELETE)
        ops.editText?.(
          container,
          index as number,
          typeof value === "number" ? value : 1,
          "",
          path,
        );
    }
    return;
  }

  const list = kind === "list";

  for (const [type, key, value] of changes) {
    switch (type) {
      case ChangeType.PENDING: {
        // Steps before a pending one are final, so `key` is also its index in `next`.
        const nextChild = (next as Record<string | number, unknown>)[key];
        const child = ops.get(container, key);
        const childKind = ops.kind(child);
        if (
          childKind !== undefined &&
          childKind === expectedKind(nextChild) &&
          (childKind !== "text" || ops.editText !== undefined)
        )
          walk(
            child as object,
            childKind,
            value as Change[],
            nextChild,
            [...path, key],
            ops,
            options,
          );
        else
          ops.set(
            container,
            key,
            options.json ? toJsonValue(nextChild) : nextChild,
            path,
          );
        break;
      }

      case ChangeType.DELETE:
        if (list) ops.splice(container, key as number, 1, [], path);
        else ops.remove(container, key as string, path);
        break;

      case ChangeType.INSERT:
        if (list) ops.splice(container, key as number, 0, [value], path);
        else ops.set(container, key, value, path);
        break;

      case ChangeType.UPDATE:
        ops.set(container, key, value, path);
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
  if (kind !== "record" && kind !== "list") return;
  walk(
    target,
    kind,
    getChanges(current as Diffable, next as Diffable, options),
    next,
    [],
    ops,
    options,
  );
};
