import { describe, expect, it } from "vitest";
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { legacy_createStore, type Reducer } from "redux";
import { createSyncEngine } from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { createReduxAdapter } from "../index.js";

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
    replaceState: (_state, action: PayloadAction<TodosState>) => action.payload,
  },
});

const { added, toggled, replaceState } = todos.actions;

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
      createReduxAdapter(store, replaceState),
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

    createSyncEngine(
      backend,
      createReduxAdapter(store, replaceState),
    ).connect();

    expect(store.getState()).toEqual({ filter: "open", todos: [bread] });
  });

  it("writes only when a dispatch produces a new state", () => {
    const store = createTodoStore();
    const { backend, writes } = countingWrites(createMemoryBackend());
    createSyncEngine(
      backend,
      createReduxAdapter(store, replaceState),
    ).connect();
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
    createSyncEngine(
      backend,
      createReduxAdapter(store, replaceState),
    ).connect();
    expect(writes).toHaveLength(1);

    backend.receive({ filter: "all", todos: [milk] });
    store.dispatch({ type: "unrelated/action" });

    expect(store.getState().todos).toEqual([milk]);
    expect(writes).toHaveLength(1);
  });

  it("applies remote changes to Immer-frozen state and keeps untouched items", () => {
    const store = createTodoStore();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      createReduxAdapter(store, replaceState),
    ).connect();
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
      createReduxAdapter(store, replaceState),
    );
    engine.connect();

    engine.disconnect();
    store.dispatch(added(milk));
    expect(backend.read()).toEqual({ filter: "all", todos: [] });

    backend.receive({ filter: "done", todos: [] });
    expect(store.getState()).toEqual({ filter: "all", todos: [milk] });
  });
});
