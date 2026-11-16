import { snapshot, subscribe } from "valtio/vanilla";
import type { StoreAdapter, Unsubscribe } from "@homeostate/core";
import { reconcile } from "./reconcile.js";

class ValtioAdapter<S extends object> implements StoreAdapter<S> {
  private state: S;

  /**
   * Valtio notifies on every property set, so one array method such as `splice` notifies once per
   * item it shifts; the engine writes them together after a microtask.
   */
  readonly batchWrites = true;

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
    // Synchronous, so that the engine ignores the notifications `setState` raises.
    return subscribe(this.state, () => onStoreChange(), true);
  }
}

/**
 * Creates a Valtio-specific store adapter that bridges a Valtio proxy with the sync engine.
 * Remote changes are applied by mutating only the paths that differ, so unchanged
 * subtrees keep their proxy identity and fine-grained subscribers stay quiet.
 *
 * A mutation reaches the backend after a microtask, together with the other mutations made
 * before it, so that one array method such as `splice` is written once, as one change; see
 * `StoreAdapter.batchWrites`. `disconnect()` writes a mutation still waiting.
 *
 * @param state - The Valtio proxy object
 * @returns StoreAdapter instance for the proxy
 *
 * @example
 * ```typescript
 * import { proxy } from 'valtio';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const state = proxy({ count: 0 });
 * const adapter = createValtioAdapter(state);
 * const backend = createYjsBackend(new Y.Doc(), 'shared');
 * const engine = createSyncEngine({ backend, adapter });
 * engine.connect();
 * state.count++;
 * ```
 */
export function createValtioAdapter<S extends object>(
  state: S,
): StoreAdapter<S> {
  return new ValtioAdapter(state);
}
