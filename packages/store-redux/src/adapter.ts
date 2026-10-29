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

/**
 * The type of the action that {@link replaceState} creates. Pass it to Redux DevTools'
 * `actionsDenylist` to hide remote changes from the log, or to Redux Toolkit's
 * `serializableCheck.ignoredActions` so the check does not walk every remote state.
 */
export const REPLACE_STATE = "@homeostate/replaceState";

/** An action that replaces the whole state of the store with its `payload`. */
export type ReplaceStateAction<S> = {
  type: typeof REPLACE_STATE;
  payload: S;
};

const isReplaceState = (action: {
  type: string;
}): action is ReplaceStateAction<unknown> => action.type === REPLACE_STATE;

/**
 * Creates the action that replaces the whole state of the store with `payload`, the default
 * action {@link createReduxAdapter} dispatches for remote changes. A root reducer wrapped in
 * {@link withHomeostate} handles it. Like a Redux Toolkit action creator, it has a `type` and
 * a `match` type guard, so `builder.addCase(replaceState<State>, ...)` and
 * `builder.addMatcher(replaceState.match, ...)` accept it. A reducer case that handles it must
 * return the payload as is.
 */
export const replaceState = Object.assign(
  <S>(payload: S): ReplaceStateAction<S> => ({ type: REPLACE_STATE, payload }),
  { type: REPLACE_STATE, match: isReplaceState },
);

/**
 * Wraps a root reducer so that it answers {@link replaceState} by returning the payload as the
 * new root state, and passes every other action to `reducer`. Works with any reducer shape,
 * such as `combineReducers` of several slices, and with Redux 4, Redux 5 and Redux Toolkit.
 *
 * @example
 * ```typescript
 * const store = configureStore({
 *   reducer: withHomeostate(combineReducers({ todos, ui })),
 * });
 * const adapter = createReduxAdapter(store);
 * ```
 */
export function withHomeostate<S, A extends { type: string }, P = S>(
  reducer: (state: S | P | undefined, action: A) => S,
): (state: S | P | undefined, action: A) => S {
  return (state, action) =>
    isReplaceState(action) ? (action.payload as S) : reducer(state, action);
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
 * The adapter applies remote changes by dispatching an action that replaces the whole root
 * state. By default that is {@link replaceState}, which a root reducer wrapped in
 * {@link withHomeostate} handles, whatever its shape.
 *
 * @param store - A Redux 4 or 5 store, a Redux Toolkit store, or any {@link ReduxLikeStore}
 * @param setStateAction - Action creator for an action that a reducer case answers by
 *   returning the given state as the new root state, as is. Only its `type` is required.
 *   Defaults to {@link replaceState}.
 * @returns StoreAdapter instance for the Redux store
 *
 * @example
 * ```typescript
 * import { combineReducers, configureStore } from '@reduxjs/toolkit';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const store = configureStore({
 *   reducer: withHomeostate(combineReducers({ todos: todos.reducer, ui: ui.reducer })),
 * });
 * const adapter = createReduxAdapter(store);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export function createReduxAdapter<S extends object>(
  store: ReduxLikeStore<S>,
  setStateAction: (state: S) => { type: string } = replaceState,
): StoreAdapter<S> {
  return new ReduxAdapter(store, setStateAction);
}
