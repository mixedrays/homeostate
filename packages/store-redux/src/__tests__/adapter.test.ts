import { describe, expect, expectTypeOf, it } from "vitest";
import {
  combineReducers,
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { legacy_createStore, type Reducer, type UnknownAction } from "redux";
import { createSyncEngine } from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import {
  createReduxAdapter,
  REPLACE_STATE,
  replaceState,
  withHomeostate,
  type ReduxLikeStore,
  type ReplaceStateAction,
} from "../index.js";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

interface TodosState {
  filter: string;
  todos: Todo[];
}

const todos = createSlice({
  name: "todos",
  initialState: { filter: "all", todos: [] } as TodosState,
  reducers: {
    added: (state, action: PayloadAction<Todo>) => {
      state.todos.push(action.payload);
    },
    toggled: (state, action: PayloadAction<string>) => {
      const todo = state.todos.find((t) => t.id === action.payload);
      if (todo) todo.done = !todo.done;
    },
    replaced: (_state, action: PayloadAction<TodosState>) => action.payload,
  },
});

const { added, toggled, replaced } = todos.actions;

const createTodoStore = () => configureStore({ reducer: todos.reducer });

const milk: Todo = { id: "1", title: "Milk", done: false };
const bread: Todo = { id: "2", title: "Bread", done: false };

const countingWrites = (backend: MemoryBackend) => {
  const writes: unknown[] = [];
  const counting: MemoryBackend = {
    ...backend,
    write: (next) => {
      writes.push(next);
      backend.write(next);
    },
  };
  return { backend: counting, writes };
};

describe("ReduxAdapter", () => {
  it("seeds the backend, writes dispatched changes, and applies remote changes", () => {
    const store = createTodoStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      createReduxAdapter(store, replaced),
    );

    engine.connect();
    expect(backend.read()).toEqual({ filter: "all", todos: [] });

    store.dispatch(added(milk));
    expect(backend.read()).toEqual({ filter: "all", todos: [milk] });

    backend.receive({ filter: "done", todos: [{ ...milk, done: true }] });
    expect(store.getState()).toEqual({
      filter: "done",
      todos: [{ ...milk, done: true }],
    });
  });

  it("adopts a non-empty backend as the initial state", () => {
    const store = createTodoStore();
    const backend = createMemoryBackend({ filter: "open", todos: [bread] });

    createSyncEngine(backend, createReduxAdapter(store, replaced)).connect();

    expect(store.getState()).toEqual({ filter: "open", todos: [bread] });
  });

  it("writes only when a dispatch produces a new state", () => {
    const store = createTodoStore();
    const { backend, writes } = countingWrites(createMemoryBackend());
    createSyncEngine(backend, createReduxAdapter(store, replaced)).connect();
    store.dispatch(added(milk));
    expect(writes).toHaveLength(2);

    store.dispatch({ type: "unrelated/action" });
    store.dispatch(toggled("missing"));
    expect(writes).toHaveLength(2);

    store.dispatch(toggled(milk.id));
    expect(writes).toHaveLength(3);
  });

  it("does not echo a remote change back to the backend", () => {
    const store = createTodoStore();
    const { backend, writes } = countingWrites(createMemoryBackend());
    createSyncEngine(backend, createReduxAdapter(store, replaced)).connect();
    expect(writes).toHaveLength(1);

    backend.receive({ filter: "all", todos: [milk] });
    store.dispatch({ type: "unrelated/action" });

    expect(store.getState().todos).toEqual([milk]);
    expect(writes).toHaveLength(1);
  });

  it("applies remote changes to Immer-frozen state and keeps untouched items", () => {
    const store = createTodoStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createReduxAdapter(store, replaced)).connect();
    store.dispatch(added(milk));
    store.dispatch(added(bread));
    const before = store.getState();
    expect(Object.isFrozen(before.todos[1])).toBe(true);

    backend.receive({ filter: "all", todos: [{ ...milk, done: true }, bread] });
    const after = store.getState();
    expect(after.todos[0]).toEqual({ ...milk, done: true });
    expect(after.todos[1]).toBe(before.todos[1]);

    store.dispatch(toggled(bread.id));
    expect(backend.read()).toEqual({
      filter: "all",
      todos: [
        { ...milk, done: true },
        { ...bread, done: true },
      ],
    });
  });

  it("works with a plain Redux store and a hand-written reducer", () => {
    interface Counter {
      count: number;
      label: string;
    }
    const replace = (payload: Counter) => ({
      type: "counter/replace",
      payload,
    });
    const reducer: Reducer<Counter> = (
      state = { count: 0, label: "a" },
      action,
    ) => {
      if (action.type === "counter/increment") {
        return { ...state, count: state.count + 1 };
      }
      if (action.type === "counter/replace") {
        return (action as ReturnType<typeof replace>).payload;
      }
      return state;
    };
    const store = legacy_createStore(reducer);
    const backend = createMemoryBackend();

    createSyncEngine(backend, createReduxAdapter(store, replace)).connect();
    store.dispatch({ type: "counter/increment" });
    expect(backend.read()).toEqual({ count: 1, label: "a" });

    backend.receive({ count: 5, label: "b" });
    expect(store.getState()).toEqual({ count: 5, label: "b" });
  });

  it("writes what a replace case that normalises its payload makes of a remote change", () => {
    interface Counted {
      todos: string[];
      count: number;
    }
    const counted = createSlice({
      name: "counted",
      initialState: { todos: [], count: 0 } as Counted,
      reducers: {
        replaced: (_state, action: PayloadAction<Counted>) => ({
          ...action.payload,
          count: action.payload.todos.length,
        }),
      },
    });
    const store = configureStore({ reducer: counted.reducer });
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      createReduxAdapter(store, counted.actions.replaced),
    ).connect();

    backend.receive({ todos: ["a", "b"], count: 0 });

    expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
    expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
  });

  it("leaves a remote change in the backend when no reducer handles the replace action", () => {
    const counter = createSlice({
      name: "counter",
      initialState: { count: 0 },
      reducers: {
        increment: (state) => {
          state.count++;
        },
      },
    });
    const store = configureStore({ reducer: counter.reducer });
    const { backend, writes } = countingWrites(createMemoryBackend());
    const replace = (payload: { count: number }) => ({
      type: "counter/replaceState",
      payload,
    });
    createSyncEngine(backend, createReduxAdapter(store, replace)).connect();
    writes.length = 0;

    backend.receive({ count: 5 });

    expect(store.getState()).toEqual({ count: 0 });
    expect(backend.read()).toEqual({ count: 5 });
    expect(writes).toHaveLength(0);
  });

  it("stops both directions after disconnect", () => {
    const store = createTodoStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      createReduxAdapter(store, replaced),
    );
    engine.connect();

    engine.disconnect();
    store.dispatch(added(milk));
    expect(backend.read()).toEqual({ filter: "all", todos: [] });

    backend.receive({ filter: "done", todos: [] });
    expect(store.getState()).toEqual({ filter: "all", todos: [milk] });
  });
});

describe("withHomeostate and replaceState", () => {
  const ui = createSlice({
    name: "ui",
    initialState: { dark: false },
    reducers: {
      darkened: (state) => {
        state.dark = true;
      },
    },
  });

  it("syncs a store of several slices both ways with no replace case of its own", () => {
    const store = configureStore({
      reducer: withHomeostate(
        combineReducers({ todos: todos.reducer, ui: ui.reducer }),
      ),
    });
    const backend = createMemoryBackend();
    createSyncEngine(backend, createReduxAdapter(store)).connect();
    expect(backend.read()).toEqual({
      todos: { filter: "all", todos: [] },
      ui: { dark: false },
    });

    store.dispatch(added(milk));
    store.dispatch(ui.actions.darkened());
    expect(backend.read()).toEqual({
      todos: { filter: "all", todos: [milk] },
      ui: { dark: true },
    });

    backend.receive({
      todos: { filter: "done", todos: [bread] },
      ui: { dark: false },
    });
    expect(store.getState()).toEqual({
      todos: { filter: "done", todos: [bread] },
      ui: { dark: false },
    });

    store.dispatch(toggled(bread.id));
    expect(backend.read()).toEqual({
      todos: { filter: "done", todos: [{ ...bread, done: true }] },
      ui: { dark: false },
    });
  });
  it("syncs a slice that handles replaceState in its extra reducers", () => {
    const counter = createSlice({
      name: "counter",
      initialState: { count: 0 },
      reducers: {
        increment: (state) => {
          state.count++;
        },
      },
      extraReducers: (builder) =>
        builder.addCase(
          replaceState<{ count: number }>,
          (_state, action) => action.payload,
        ),
    });
    const store = configureStore({ reducer: counter.reducer });
    const backend = createMemoryBackend();
    createSyncEngine(backend, createReduxAdapter(store)).connect();

    store.dispatch(counter.actions.increment());
    expect(backend.read()).toEqual({ count: 1 });

    backend.receive({ count: 5 });
    expect(store.getState()).toEqual({ count: 5 });
  });
  it("syncs a plain Redux store whose reducer is wrapped", () => {
    const reducer = (
      state: { count: number } = { count: 0 },
      action: { type: string },
    ) =>
      action.type === "counter/increment" ? { count: state.count + 1 } : state;
    const store = legacy_createStore(withHomeostate(reducer));
    const backend = createMemoryBackend();
    createSyncEngine(backend, createReduxAdapter(store)).connect();

    store.dispatch({ type: "counter/increment" });
    expect(backend.read()).toEqual({ count: 1 });

    backend.receive({ count: 7 });
    expect(store.getState()).toEqual({ count: 7 });

    store.dispatch({ type: "counter/increment" });
    expect(backend.read()).toEqual({ count: 8 });
  });
  it("keeps the wrapped reducer's types and types the replace action by its payload", () => {
    const combined = combineReducers({ todos: todos.reducer, ui: ui.reducer });
    type Root = { todos: TodosState; ui: { dark: boolean } };
    const store = configureStore({ reducer: withHomeostate(combined) });
    expectTypeOf(store.getState()).toEqualTypeOf<Root>();
    expectTypeOf(withHomeostate(combined)).toEqualTypeOf<typeof combined>();

    type Preloaded = Partial<{ count: number }>;
    const preloading: Reducer<{ count: number }, UnknownAction, Preloaded> = (
      state = { count: 0 },
    ) => ({ count: state.count ?? 0 });
    expectTypeOf(withHomeostate(preloading)).toEqualTypeOf<
      Reducer<{ count: number }, UnknownAction, Preloaded>
    >();

    const action = replaceState(store.getState());
    expectTypeOf(action).toEqualTypeOf<ReplaceStateAction<Root>>();
    expectTypeOf(action.type).toEqualTypeOf<"@homeostate/replaceState">();
    expect(action).toEqual({ type: REPLACE_STATE, payload: store.getState() });
    expect(replaceState.type).toBe("@homeostate/replaceState");
    store.dispatch(action);

    const unknown: UnknownAction = action;
    if (replaceState.match(unknown)) {
      expectTypeOf(unknown.payload).toBeUnknown();
    }
    expect(replaceState.match(unknown)).toBe(true);
    expect(replaceState.match(added(milk))).toBe(false);
  });
});

describe("Redux-like stores", () => {
  interface Counter {
    count: number;
  }
  type CounterAction =
    | { type: "counter/increment" }
    | { type: "counter/replace"; payload: Counter };
  const replace = (payload: Counter): CounterAction => ({
    type: "counter/replace",
    payload,
  });
  const counterReducer = (
    state: Counter = { count: 0 },
    action: CounterAction,
  ): Counter => {
    if (action.type === "counter/increment") return { count: state.count + 1 };
    if (action.type === "counter/replace") return action.payload;
    return state;
  };

  /** Redux 4's `Store` declaration, which Redux 5's `Store` type does not accept. */
  interface Redux4Dispatch<A extends { type: string }> {
    <T extends A>(action: T): T;
  }
  interface Redux4Store<S, A extends { type: string }> {
    dispatch: Redux4Dispatch<A>;
    getState(): S;
    subscribe(listener: () => void): () => void;
    replaceReducer(next: (state: S | undefined, action: A) => S): void;
  }

  const createRedux4Store = <S, A extends { type: string }>(
    reducer: (state: S | undefined, action: A) => S,
  ): Redux4Store<S, A> => {
    let state = reducer(undefined, { type: "@@INIT" } as A);
    const listeners = new Set<() => void>();
    return {
      dispatch: (action) => {
        state = reducer(state, action);
        listeners.forEach((listener) => listener());
        return action;
      },
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      replaceReducer: (next) => {
        reducer = next;
      },
    };
  };

  it("syncs a Redux 4-shaped store with a narrow action type", () => {
    const store = createRedux4Store(counterReducer);
    const backend = createMemoryBackend();
    const adapter = createReduxAdapter(store, replace);
    expectTypeOf(adapter.getState()).toEqualTypeOf<Counter>();

    createSyncEngine(backend, adapter).connect();
    store.dispatch({ type: "counter/increment" });
    expect(backend.read()).toEqual({ count: 1 });

    backend.receive({ count: 5 });
    expect(store.getState()).toEqual({ count: 5 });
  });

  it("syncs a store shaped like Zustand's redux middleware store", () => {
    // Zustand's `redux` middleware keeps `dispatch` in the state, merges what the reducer
    // returns into it, and calls listeners with the new and previous state.
    type State = Counter & {
      dispatch: (action: CounterAction) => CounterAction;
    };
    let state: State;
    const listeners = new Set<(state: State, previous: State) => void>();
    const dispatch = (action: CounterAction) => {
      const previous = state;
      state = { ...state, ...counterReducer(state, action) };
      listeners.forEach((listener) => listener(state, previous));
      return action;
    };
    state = { count: 0, dispatch };
    const store = {
      getState: () => state,
      dispatch,
      subscribe: (listener: (state: State, previous: State) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const backend = createMemoryBackend();

    createSyncEngine(
      backend,
      createReduxAdapter(store, (next: State) =>
        replace({ count: next.count }),
      ),
    ).connect();
    store.dispatch({ type: "counter/increment" });
    expect(backend.read()).toEqual({ count: 1 });

    backend.receive({ count: 5 });
    expect(store.getState()).toEqual({ count: 5, dispatch });
  });

  it("takes a replace action that carries the state under another name", () => {
    const store = legacy_createStore(
      (
        state: Counter = { count: 0 },
        action: { type: string; next?: Counter },
      ) => (action.type === "counter/set" && action.next ? action.next : state),
    );
    const backend = createMemoryBackend();

    createSyncEngine(
      backend,
      createReduxAdapter(store, (next) => ({ type: "counter/set", next })),
    ).connect();
    backend.receive({ count: 3 });

    expect(store.getState()).toEqual({ count: 3 });
  });

  it("types Redux Toolkit and Redux 5 stores as Redux-like stores", () => {
    expectTypeOf(createTodoStore()).toExtend<ReduxLikeStore<TodosState>>();
    expectTypeOf(legacy_createStore(counterReducer)).toExtend<
      ReduxLikeStore<Counter>
    >();
    expectTypeOf(createRedux4Store(counterReducer)).toExtend<
      ReduxLikeStore<Counter>
    >();
  });

  it("rejects a store or replace action the adapter cannot use", () => {
    const store = createRedux4Store(counterReducer);
    const unsubscribable = {
      getState: store.getState,
      dispatch: store.dispatch,
    };
    // @ts-expect-error a store without `subscribe` cannot report local changes
    createReduxAdapter(unsubscribable, replace);
    // @ts-expect-error an action needs a `type`
    createReduxAdapter(store, (next: Counter) => ({ payload: next }));
  });
});
