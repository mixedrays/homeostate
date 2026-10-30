import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  combineReducers,
  configureStore,
  createSlice,
  type ThunkDispatch,
  type UnknownAction,
  type Middleware,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  applyMiddleware,
  compose,
  legacy_createStore,
  type StoreEnhancer,
} from "redux";
import type { SyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { homeostate, REPLACE_STATE } from "../index.js";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

const todos = createSlice({
  name: "todos",
  initialState: [] as Todo[],
  reducers: {
    added: (state, action: PayloadAction<Todo>) => {
      state.push(action.payload);
    },
  },
});

const ui = createSlice({
  name: "ui",
  initialState: { dark: false },
  reducers: {
    toggledDark: (state) => {
      state.dark = !state.dark;
    },
  },
});

const { added } = todos.actions;
const { toggledDark } = ui.actions;

const rootReducer = combineReducers({
  todos: todos.reducer,
  ui: ui.reducer,
});

type RootState = ReturnType<typeof rootReducer>;

const milk: Todo = { id: "1", title: "Milk", done: false };

/** A middleware that records the type of every action dispatched through it. */
const recordingTypes = () => {
  const types: string[] = [];
  const middleware: Middleware = () => (next) => (action) => {
    types.push((action as { type: string }).type);
    return next(action);
  };
  return { middleware, types };
};

describe("homeostate enhancer", () => {
  it("seeds the backend, writes dispatched changes, and applies remote changes to an unwrapped root reducer", () => {
    const backend = createMemoryBackend();
    const store = configureStore({
      reducer: rootReducer,
      enhancers: (getDefault) => getDefault().prepend(homeostate({ backend })),
    });
    expect(backend.read()).toEqual({ todos: [], ui: { dark: false } });

    store.dispatch(added(milk));
    expect(backend.read()).toEqual({ todos: [milk], ui: { dark: false } });

    const remote: RootState = { todos: [], ui: { dark: true } };
    backend.receive(remote);
    expect(store.getState()).toEqual(remote);

    store.dispatch(toggledDark());
    expect(backend.read()).toEqual({ todos: [], ui: { dark: false } });
  });

  it("adopts a backend that holds state when the store is created", () => {
    const room: RootState = { todos: [milk], ui: { dark: true } };

    const store = legacy_createStore(
      rootReducer,
      homeostate({ backend: createMemoryBackend(room) }),
    );

    expect(store.getState()).toEqual(room);
  });

  it("adopts the backend's state over the preloaded state", () => {
    const backend = createMemoryBackend({ todos: [milk] });

    const store = legacy_createStore(
      rootReducer,
      { todos: [], ui: { dark: true } },
      homeostate({ backend }),
    );

    expect(store.getState()).toEqual({ todos: [milk], ui: { dark: true } });
    expect(backend.read()).toEqual({ todos: [milk], ui: { dark: true } });
  });

  it("leaves the backend untouched until connect() with the manual connect mode", () => {
    const backend = createMemoryBackend({ todos: [milk] });
    const calls = ["read", "write", "subscribe"] as const;
    const spies = calls.map((method) => vi.spyOn(backend, method));

    const store = legacy_createStore(
      rootReducer,
      homeostate({ backend, connect: "manual" }),
    );
    store.dispatch(toggledDark());

    expect(store.getState()).toEqual({ todos: [], ui: { dark: true } });
    expect(store.homeostate.isConnected()).toBe(false);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);

    store.homeostate.connect();
    expect(store.getState()).toEqual({ todos: [milk], ui: { dark: true } });
    store.dispatch(toggledDark());
    expect(backend.read()).toEqual({ todos: [milk], ui: { dark: false } });
  });

  it("stops syncing on disconnect() and syncs again on connect()", () => {
    const backend = createMemoryBackend();
    const store = legacy_createStore(rootReducer, homeostate({ backend }));
    expect(store.homeostate.isConnected()).toBe(true);

    store.homeostate.disconnect();
    store.dispatch(added(milk));
    backend.receive({ todos: [], ui: { dark: true } });

    expect(store.homeostate.isConnected()).toBe(false);
    expect(store.getState()).toEqual({ todos: [milk], ui: { dark: false } });
    expect(backend.read()).toEqual({ todos: [], ui: { dark: true } });

    store.homeostate.connect();
    expect(store.getState()).toEqual({ todos: [], ui: { dark: true } });
    store.dispatch(added(milk));
    expect(backend.read()).toEqual({ todos: [milk], ui: { dark: true } });
  });

  it("passes the sync engine's config on, with key names checked against the state", () => {
    const backend = createMemoryBackend();
    const errors: string[] = [];
    const store = legacy_createStore(
      rootReducer,
      homeostate<RootState>({
        backend,
        keys: ["todos"],
        seed: "never",
        onError: (_error, source) => errors.push(source),
      }),
    );
    expect(backend.read()).toEqual({});

    store.dispatch(added(milk));
    store.dispatch(toggledDark());
    expect(backend.read()).toEqual({ todos: [milk] });

    backend.receive({ todos: [], ui: { dark: false } });
    expect(store.getState()).toEqual({ todos: [], ui: { dark: true } });

    backend.write = () => {
      throw new Error("offline");
    };
    store.dispatch(added(milk));
    expect(errors).toEqual(["backend"]);

    // @ts-expect-error: the state has no `todo` key
    homeostate<RootState>({ backend, keys: ["todo"] });
  });

  it("keeps applying remote changes after replaceReducer swaps the root reducer", () => {
    const backend = createMemoryBackend();
    const store = configureStore({
      reducer: rootReducer,
      enhancers: (getDefault) => getDefault().prepend(homeostate({ backend })),
    });
    const counter = createSlice({
      name: "counter",
      initialState: 0,
      reducers: { incremented: (count) => count + 1 },
    });

    store.replaceReducer(
      combineReducers({
        todos: todos.reducer,
        ui: ui.reducer,
        counter: counter.reducer,
      }) as unknown as typeof rootReducer,
    );
    expect(backend.read()).toEqual({
      todos: [],
      ui: { dark: false },
      counter: 0,
    });

    backend.receive({ todos: [milk], ui: { dark: true }, counter: 4 });
    expect(store.getState()).toEqual({
      todos: [milk],
      ui: { dark: true },
      counter: 4,
    });
  });

  it("dispatches remote changes through the middleware when placed before the default enhancers", () => {
    const backend = createMemoryBackend();
    const { middleware, types } = recordingTypes();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(middleware),
      enhancers: (getDefault) => getDefault().prepend(homeostate({ backend })),
    });

    backend.receive({ todos: [milk], ui: { dark: false } });

    expect(types).toEqual([REPLACE_STATE]);
    expect(store.getState().todos).toEqual([milk]);
  });

  it("dispatches remote changes through the middleware when composed before applyMiddleware", () => {
    const backend = createMemoryBackend();
    const { middleware, types } = recordingTypes();
    const store = legacy_createStore(
      rootReducer,
      // Redux 5's `compose` types return `unknown` for two enhancers, whatever they are.
      compose(
        homeostate({ backend }),
        applyMiddleware(middleware),
      ) as StoreEnhancer<{ homeostate: SyncEngine }>,
    );
    expect(store.homeostate.isConnected()).toBe(true);

    backend.receive({ todos: [milk], ui: { dark: false } });

    expect(types).toEqual([REPLACE_STATE]);
    expect(store.getState().todos).toEqual([milk]);
  });

  it("syncs below the middleware when placed after the default enhancers", () => {
    const backend = createMemoryBackend();
    const { middleware, types } = recordingTypes();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(middleware),
      enhancers: (getDefault) => getDefault().concat(homeostate({ backend })),
    });
    expect(store.homeostate.isConnected()).toBe(true);

    store.dispatch(added(milk));
    backend.receive({ todos: [milk], ui: { dark: true } });

    expect(types).toEqual([added.type]);
    expect(store.getState()).toEqual({ todos: [milk], ui: { dark: true } });
  });

  it("types store.homeostate as a SyncEngine, keeping the store's own types", () => {
    const backend = createMemoryBackend();
    const prepended = configureStore({
      reducer: rootReducer,
      enhancers: (getDefault) => getDefault().prepend(homeostate({ backend })),
    });
    const concatenated = configureStore({
      reducer: rootReducer,
      enhancers: (getDefault) => getDefault().concat(homeostate({ backend })),
    });
    const legacy = legacy_createStore(rootReducer, homeostate({ backend }));

    expectTypeOf(prepended.homeostate).toEqualTypeOf<SyncEngine>();
    expectTypeOf(concatenated.homeostate).toEqualTypeOf<SyncEngine>();
    expectTypeOf(legacy.homeostate).toEqualTypeOf<SyncEngine>();
    expectTypeOf(prepended.getState()).toEqualTypeOf<RootState>();
    expectTypeOf(legacy.getState()).toEqualTypeOf<RootState>();
    expectTypeOf(prepended.dispatch).toExtend<
      ThunkDispatch<RootState, undefined, UnknownAction>
    >();
  });
});
