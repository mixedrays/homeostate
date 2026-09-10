import type { Store, Unsubscribe as ReduxUnsubscribe } from 'redux';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * Redux-specific store adapter that bridges Redux stores with the sync engine.
 * 
 * This adapter wraps a Redux store to conform to the StoreAdapter interface,
 * enabling Redux stores to sync through any CRDT backend. Immer-frozen state
 * is fine: the engine never mutates store state in place.
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
 * const adapter = createReduxAdapter(store, { count: 0 }, counterSlice.actions.setState);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export class ReduxAdapter<S> implements StoreAdapter<S> {
  private store: Store<S>;
  private initialState: S;
  private isFromSync = false;
  private setStateAction: (state: S) => { type: string; payload: S };

  /**
   * Create a Redux adapter
   * @param store - The Redux store instance
   * @param initialState - Initial state values
   * @param setStateAction - Action creator for setting the entire state (for sync updates)
   */
  constructor(
    store: Store<S>,
    initialState: S,
    setStateAction: (state: S) => { type: string; payload: S }
  ) {
    this.store = store;
    this.initialState = initialState;
    this.setStateAction = setStateAction;
  }

  getState(): S {
    return this.store.getState();
  }

  setState(state: S, fromSync = false): void {
    if (fromSync) {
      this.isFromSync = true;
    }
    
    // Dispatch the setState action to update the Redux store
    this.store.dispatch(this.setStateAction(state));
    
    this.isFromSync = false;
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    // Wrap the callback to filter out sync-originated changes
    let previousState = this.store.getState();
    
    const unsubscribe: ReduxUnsubscribe = this.store.subscribe(() => {
      const currentState = this.store.getState();
      
      // Only trigger if state actually changed and not from sync
      if (currentState !== previousState && !this.isFromSync) {
        previousState = currentState;
        onStoreChange();
      } else {
        previousState = currentState;
      }
    });
    
    return unsubscribe;
  }

  getInitialState(): S {
    return this.initialState;
  }
}

/**
 * Factory function to create a Redux adapter
 * 
 * @param store - The Redux store instance
 * @param initialState - Initial state values
 * @param setStateAction - Action creator for setting the entire state
 * @returns StoreAdapter instance for the Redux store
 * 
 * @example
 * ```typescript
 * const todoSlice = createSlice({
 *   name: 'todos',
 *   initialState: { todos: [], filter: 'all' },
 *   reducers: {
 *     // ... other reducers
 *     setState: (state, action) => action.payload,
 *   },
 * });
 * 
 * const store = configureStore({ reducer: todoSlice.reducer });
 * const adapter = createReduxAdapter(
 *   store,
 *   { todos: [], filter: 'all' },
 *   todoSlice.actions.setState
 * );
 * ```
 */
export function createReduxAdapter<S>(
  store: Store<S>,
  initialState: S,
  setStateAction: (state: S) => { type: string; payload: S }
): StoreAdapter<S> {
  return new ReduxAdapter(store, initialState, setStateAction);
}
