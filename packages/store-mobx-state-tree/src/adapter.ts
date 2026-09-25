import {
  applySnapshot,
  getSnapshot,
  onSnapshot,
  type IStateTreeNode,
  type IType,
} from 'mobx-state-tree';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/** A state tree node whose output snapshot is `S` */
export type SnapshotNode<S> = IStateTreeNode<IType<unknown, S, unknown>>;

/**
 * MobX-State-Tree adapter that syncs a tree node through its snapshots.
 * Snapshots go to the backend once per action, and remote changes are applied
 * with `applySnapshot`, so instances with identifiers are reconciled in place.
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
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * counter.increment();
 * ```
 */
export class MobxStateTreeAdapter<S extends object> implements StoreAdapter<S> {
  private node: SnapshotNode<S>;

  /**
   * Create a MobX-State-Tree adapter
   * @param node - The tree node to sync; usually the root instance
   */
  constructor(node: SnapshotNode<S>) {
    this.node = node;
  }

  getState(): S {
    return getSnapshot(this.node);
  }

  setState(state: S): void {
    applySnapshot(this.node, state);
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return onSnapshot(this.node, () => onStoreChange());
  }
}

/**
 * Factory function to create a MobX-State-Tree adapter
 *
 * @param node - The tree node to sync; usually the root instance
 * @returns StoreAdapter instance for the node
 */
export function createMobxStateTreeAdapter<S extends object>(node: SnapshotNode<S>): StoreAdapter<S> {
  return new MobxStateTreeAdapter(node);
}
