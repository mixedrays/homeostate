import type { Store } from 'redux';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * Redux-specific store adapter that bridges Redux stores with the sync engine.
 * Immer-frozen state is fine: the engine never mutates store state in place.
 *
 * @example
 * ```typescript
 * import { configureStore, createSlice } from '@reduxjs/toolkit';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const counterSlice = createSlice({
 *   name: 'counter',
 *   initialState: { count: 0 },
 *   reducers: {
 *     increment: (state) => { state.count++; },
 *     setState: (_state, action) => action.payload,
 *   },
 * });
 *
 * const store = configureStore({ reducer: counterSlice.reducer });
 * const adapter = createReduxAdapter(store, counterSlice.actions.setState);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export class ReduxAdapter<S extends object> implements StoreAdapter<S> {
  private store: Store<S>;
  private setStateAction: (state: S) => { type: string; payload: S };

  /**
   * Create a Redux adapter
   * @param store - The Redux store instance
   * @param setStateAction - Action creator that replaces the entire state (for sync updates)
   */
  constructor(store: Store<S>, setStateAction: (state: S) => { type: string; payload: S }) {
    this.store = store;
    this.setStateAction = setStateAction;
  }

  getState(): S {
    return this.store.getState();
  }

  setState(state: S): void {
    this.store.dispatch(this.setStateAction(state));
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    let previousState = this.store.getState();

    return this.store.subscribe(() => {
      const currentState = this.store.getState();
      if (currentState === previousState) return;
      previousState = currentState;
      onStoreChange();
    });
  }
}

/**
 * Factory function to create a Redux adapter
 *
 * @param store - The Redux store instance
 * @param setStateAction - Action creator that replaces the entire state
 * @returns StoreAdapter instance for the Redux store
 */
export function createReduxAdapter<S extends object>(
  store: Store<S>,
  setStateAction: (state: S) => { type: string; payload: S }
): StoreAdapter<S> {
  return new ReduxAdapter(store, setStateAction);
}
