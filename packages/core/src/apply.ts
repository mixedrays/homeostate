import { ChangeType, type Change } from './change.js';

type Plain = Record<string, unknown>;

/**
 * How one store writes into its containers. `applyChanges` decides *what* to write; an
 * implementation of this decides *how*, so the same edit script drives a MobX observable
 * tree, a Valtio proxy, or a plain object.
 *
 * Every method receives a container that already lives in the store, never a copy.
 */
export interface ApplyOps {
  /** Assign `value` at `key`, creating the property if the target is a record. */
  set(target: object, key: string | number, value: unknown): void;
  /** Remove the record property `key`. */
  remove(target: object, key: string): void;
  /** `Array.prototype.splice`: drop `deleteCount` elements at `index`, then add `inserted`. */
  splice(target: unknown[], index: number, deleteCount: number, inserted: unknown[]): void;
}

/**
 * Revises `value` by the character-level edit script `changes`, which is what `getChanges`
 * returns for two strings. Each index addresses the string as revised by the steps before it.
 */
export const applyStringChanges = (value: string, changes: Change[]): string =>
  changes.reduce((revised, [type, index, inserted]) => {
    const at = index as number;
    if (type === ChangeType.INSERT) return revised.slice(0, at) + (inserted as string) + revised.slice(at);
    if (type === ChangeType.DELETE) return revised.slice(0, at) + revised.slice(at + 1);
    return revised;
  }, value);

/**
 * Applies `changes` to `target` in place, mutating only the paths the edit script names.
 * Everything else keeps its identity, which is what fine-grained stores react to.
 *
 * `changes` must be `getChanges(before, after)` where `before` describes the shape `target`
 * currently holds — an adapter gets that by diffing against the snapshot it last handed out.
 * A `PENDING` step carries no replacement value, so it can only be followed by recursing into
 * the container already there; a target that does not mirror `before` leaves such a step
 * unapplied rather than writing something wrong.
 *
 * @param target The container to mutate — a record, or an array for a positional edit script.
 * @param changes The edit script to apply, in order.
 * @param ops How this store writes; see {@link ApplyOps}.
 */
export const applyChanges = (target: object, changes: Change[], ops: ApplyOps): void => {
  const array = Array.isArray(target) ? (target as unknown[]) : null;

  for (const [type, key, value] of changes) {
    switch (type) {
      case ChangeType.PENDING: {
        const child = (target as Plain)[key as string];
        if (typeof child === 'string')
          ops.set(target, key, applyStringChanges(child, value as Change[]));
        else if (child !== null && typeof child === 'object')
          applyChanges(child, value as Change[], ops);
        break;
      }

      case ChangeType.DELETE:
        if (array) ops.splice(array, key as number, 1, []);
        else ops.remove(target, key as string);
        break;

      case ChangeType.INSERT:
        if (array) ops.splice(array, key as number, 0, [value]);
        else ops.set(target, key, value);
        break;

      case ChangeType.UPDATE:
        ops.set(target, key, value);
        break;
    }
  }
};
