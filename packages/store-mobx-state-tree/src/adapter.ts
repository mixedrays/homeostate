import {
  applySnapshot,
  getSnapshot,
  getType,
  onSnapshot,
  typecheck,
  type IAnyType,
  type IStateTreeNode,
  type IType,
} from "mobx-state-tree";
import type { StoreAdapter, Unsubscribe } from "@homeostate/core";

/** A state tree node whose output snapshot is `S` */
export type SnapshotNode<S> = IStateTreeNode<IType<unknown, S, unknown>>;

/**
 * One problem MST's type check found in a snapshot: the value, and the path to it as `context`,
 * MST's `IValidationError`, which `mobx-state-tree` does not export
 */
export type SnapshotValidationError = ReturnType<IAnyType["validate"]>[number];

/** The options of `createMobxStateTreeAdapter` and `syncStateTree` */
export interface MobxStateTreeAdapterOptions {
  /**
   * What to do with a remote state that does not fit the node's type, such as one a peer on
   * another version of the model sends. With it, the adapter checks every remote state against
   * the node's type before `applySnapshot`, in every build, whatever MST's type checking is set
   * to, and never applies an invalid state, not even its valid parts:
   * - `'throw'`: throws MST's type check error, as MST's `typecheck` does. The engine hands it to
   *   `onError` with the source `'store'`; without `onError` it reaches the provider that
   *   delivered the change, and `connect()` throws it
   * - `'skip'`: leaves the node as it is and reports nothing
   * - a function: called with MST's validation errors and the state, and the node is left as it
   *   is. What it throws goes where `'throw'`'s error goes
   *
   * Without it, `applySnapshot` decides: in development it throws a type check error, and with
   * type checking disabled, as in production, it applies the state unchecked.
   *
   * A rejected state stays in the backend, and the node keeps its own state, so the next local
   * change writes the node's state over it, for every peer: whatever the peer changed is lost,
   * its valid changes included. Peers on different versions of the model need a migration
   * strategy, such as `types.snapshotProcessor` or a version key, to avoid this.
   */
  onInvalidSnapshot?:
    | "throw"
    | "skip"
    | ((errors: SnapshotValidationError[], snapshot: unknown) => void);
}

class MobxStateTreeAdapter<S extends object> implements StoreAdapter<S> {
  private node: SnapshotNode<S>;
  private onInvalidSnapshot: MobxStateTreeAdapterOptions["onInvalidSnapshot"];

  /**
   * Create a MobX-State-Tree adapter
   * @param node - The tree node to sync; usually the root instance
   * @param options - What to do with an invalid remote state
   */
  constructor(node: SnapshotNode<S>, options: MobxStateTreeAdapterOptions) {
    this.node = node;
    this.onInvalidSnapshot = options.onInvalidSnapshot;
  }

  getState(): S {
    return getSnapshot(this.node);
  }

  setState(state: S): void {
    const policy = this.onInvalidSnapshot;
    if (policy !== undefined) {
      const type = getType(this.node);
      // `typecheck` and `validate` check in every build; `applySnapshot` only with type checking.
      if (policy === "throw") typecheck(type, state);
      else {
        const errors = type.validate(state, [{ path: "", type }]);
        if (errors.length > 0) {
          if (policy !== "skip") policy(errors, state);
          return;
        }
      }
    }
    applySnapshot(this.node, state);
  }

  /**
   * MST runs snapshot listeners in a MobX reaction whose error handler rethrows, which skips
   * MobX's own cleanup: the batch never ends and every reaction in the process stops. So what
   * `onStoreChange` throws is logged here instead, as MobX logs what its reactions throw.
   */
  subscribe(onStoreChange: () => void): Unsubscribe {
    return onSnapshot(this.node, () => {
      try {
        onStoreChange();
      } catch (error) {
        console.error(
          "[homeostate] syncing a local change of a MobX-State-Tree node failed:",
          error,
        );
      }
    });
  }
}

/**
 * Creates a MobX-State-Tree adapter that syncs a tree node through its snapshots.
 * Snapshots go to the backend once per action, and remote changes are applied
 * with `applySnapshot`, so instances with identifiers are reconciled in place.
 *
 * Pass `onInvalidSnapshot` to check each remote state against the node's type in every build,
 * and to decide what happens to one that does not fit; see `MobxStateTreeAdapterOptions`.
 *
 * @param node - The tree node to sync; usually the root instance
 * @param options - `onInvalidSnapshot`, for a remote state that does not fit the node's type
 * @returns StoreAdapter instance for the node
 *
 * @example
 * ```typescript
 * import { types } from 'mobx-state-tree';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const Counter = types
 *   .model({ count: 0 })
 *   .actions((self) => ({ increment() { self.count++; } }));
 *
 * const counter = Counter.create();
 * const adapter = createMobxStateTreeAdapter(counter);
 * const backend = createYjsBackend(new Y.Doc(), 'shared');
 * const engine = createSyncEngine({ backend, adapter });
 * engine.connect();
 * counter.increment();
 * ```
 */
export function createMobxStateTreeAdapter<S extends object>(
  node: SnapshotNode<S>,
  options: MobxStateTreeAdapterOptions = {},
): StoreAdapter<S> {
  return new MobxStateTreeAdapter(node, options);
}
