import { snapshot, subscribe } from 'valtio/vanilla';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';
import { reconcile } from './reconcile.js';

/**
 * Valtio-specific store adapter that bridges a Valtio proxy with the sync engine.
 * Remote changes are applied by mutating only the paths that differ, so unchanged
 * subtrees keep their proxy identity and fine-grained subscribers stay quiet.
 *
 * @example
 * ```typescript
 * import { proxy } from 'valtio';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const state = proxy({ count: 0 });
 * const adapter = createValtioAdapter(state);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * state.count++;
 * ```
 */
export class ValtioAdapter<S extends object> implements StoreAdapter<S> {
  private state: S;

  /**
   * Create a Valtio adapter
   * @param state - The Valtio proxy object
   */
  constructor(state: S) {
    this.state = state;
  }

  getState(): S {
    return snapshot(this.state) as S;
  }

  setState(next: S): void {
    reconcile(this.state, this.getState(), next);
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return subscribe(this.state, () => onStoreChange(), true);
  }
}

/**
 * Factory function to create a Valtio adapter
 *
 * @param state - The Valtio proxy object
 * @returns StoreAdapter instance for the proxy
 */
export function createValtioAdapter<S extends object>(state: S): StoreAdapter<S> {
  return new ValtioAdapter(state);
}
