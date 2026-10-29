import type { StoreAdapter, Unsubscribe } from "@homeostate/core";

/**
 * The part of a Redux store the adapter uses. A Redux 4 or Redux 5 store, a Redux Toolkit
 * store, and any store with Redux's interface, such as one made with Zustand's `redux`
 * middleware, satisfy it, so the package needs no `redux` dependency.
 */
export interface ReduxLikeStore<S> {
  getState(): S;
  dispatch(action: { type: string }): unknown;
  subscribe(listener: () => void): () => void;
}

class ReduxAdapter<S extends object> implements StoreAdapter<S> {
  private store: ReduxLikeStore<S>;
  private setStateAction: (state: S) => { type: string };

  /**
   * Create a Redux adapter
   * @param store - The Redux store instance
   * @param setStateAction - Action creator that replaces the entire state (for sync updates)
   */
  constructor(
    store: ReduxLikeStore<S>,
    setStateAction: (state: S) => { type: string },
  ) {
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
 * Creates a Redux-specific store adapter that bridges Redux stores with the sync engine.
 * Immer-frozen state is fine: the engine never mutates store state in place.
 *
 * @param store - A Redux 4 or 5 store, a Redux Toolkit store, or any {@link ReduxLikeStore}
 * @param setStateAction - Action creator for an action that a reducer case answers by
 *   returning the given state as the new root state. Only its `type` is required.
 * @returns StoreAdapter instance for the Redux store
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
export function createReduxAdapter<S extends object>(
  store: ReduxLikeStore<S>,
  setStateAction: (state: S) => { type: string },
): StoreAdapter<S> {
  return new ReduxAdapter(store, setStateAction);
}
