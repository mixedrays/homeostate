# @homeostate/store-redux

[![npm](https://img.shields.io/npm/v/@homeostate/store-redux?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-redux)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-redux?externals=@homeostate/core&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-redux&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-redux?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-redux)
[![license](https://img.shields.io/npm/l/@homeostate/store-redux?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-redux/LICENSE)

[Redux](https://redux.js.org) store enhancer and adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a Redux store in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-redux @reduxjs/toolkit @homeostate/crdt-yjs yjs
```

The adapter does not depend on `redux`: it takes any store with Redux's `getState`,
`dispatch` and `subscribe`. Redux Toolkit, Redux 4 and Redux 5 stores work, and so does a
store made with Zustand's `redux` middleware. Only the types of the `homeostate` enhancer need
`redux`, an optional peer dependency that Redux Toolkit already installs. For a plain Redux
store, install `redux` instead of `@reduxjs/toolkit`.

## Usage

Add the `homeostate` enhancer to the store. It takes the backend and any sync engine options,
and exposes the sync engine as `store.homeostate`:

```ts
import * as Y from "yjs";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-redux";

const counter = createSlice({
  name: "counter",
  initialState: { count: 0 },
  reducers: {
    increment: (state) => {
      state.count++;
    },
  },
});

const ui = createSlice({
  name: "ui",
  initialState: { dark: false },
  reducers: {
    toggleDark: (state) => {
      state.dark = !state.dark;
    },
  },
});

const store = configureStore({
  reducer: { counter: counter.reducer, ui: ui.reducer },
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().prepend(
      homeostate({ backend: createYjsBackend(new Y.Doc(), "shared") }),
    ),
});

store.homeostate.disconnect(); // stop syncing
store.homeostate.connect(); // sync again
```

The store connects when it is created: a room that already has state replaces the store's
synced state, and an empty room is seeded from the store. The enhancer applies remote changes
by dispatching `replaceState`, an action that replaces the whole root state, and wraps the
root reducer in `withHomeostate` to handle it, whatever its shape. It also wraps a reducer
later passed to `store.replaceReducer`.

| Option                                                  | Default  | Description                                                          |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `backend`                                               |          | The `CrdtBackend` the store syncs with                               |
| `connect`                                               | `"auto"` | `"manual"` leaves `store.homeostate.connect()` to the app; see below |
| `omit`, `keys`, `filter`, `seed`, `schedule`, `onError` |          | The engine's `SyncEngineConfig`, typed by the root state             |

Pass the root state type to check the names in `omit` and `keys` against it, so
`homeostate<RootState>({ backend, omit: ["ui"] })` keeps the `ui` slice on each device, and a
misspelled key fails to compile.

Immer-frozen state is fine: the engine never mutates store state in place. Local changes
are sent only when a dispatch produces a new state object.

### Connecting later

With `connect: "manual"`, the store is created without touching the backend, and the app
connects it when it is ready, for example once its provider has received the room's state:

```ts
const store = configureStore({
  reducer: rootReducer,
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().prepend(homeostate({ backend, connect: "manual" })),
});

provider.once("sync", () => store.homeostate.connect());
```

Until then the store works locally. Connecting then works as on any `connect()`: the room's
values replace the store's for every key the room holds, edits made meanwhile included, and
keys the room lacks seed it.

### Placing the enhancer

The enhancer dispatches `replaceState` on the store it wraps, so its place among the
enhancers decides whether the middleware sees remote changes:

- **Before the middleware**, with `getDefaultEnhancers().prepend(homeostate(...))`: remote
  changes go through every middleware, as a `store.dispatch` does, so listener middleware,
  sagas and Redux Toolkit's development checks see them. This is the recommended placement.
- **After the middleware**, with `getDefaultEnhancers().concat(homeostate(...))`: the store
  syncs the same way, but remote changes skip the middleware.

With plain Redux, compose the enhancer before `applyMiddleware`:

```ts
import {
  applyMiddleware,
  compose,
  legacy_createStore,
  type StoreEnhancer,
} from "redux";
import type { SyncEngine } from "@homeostate/core";
import { homeostate } from "@homeostate/store-redux";

const store = legacy_createStore(
  rootReducer,
  compose(homeostate({ backend }), applyMiddleware(logger)) as StoreEnhancer<{
    homeostate: SyncEngine;
  }>,
);
```

Redux 5's `compose` types return `unknown` for two or more enhancers, so state what the
composed enhancer adds. A store with no middleware takes the enhancer alone:
`legacy_createStore(rootReducer, homeostate({ backend }))`.

### Without the enhancer

The adapter can also be wired by hand, for example to share one store adapter with other
tools. Wrap the root reducer in `withHomeostate`, then create the adapter and the engine:

```ts
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { createSyncEngine } from "@homeostate/core";
import { createReduxAdapter, withHomeostate } from "@homeostate/store-redux";

const store = configureStore({
  reducer: withHomeostate(
    combineReducers({ counter: counter.reducer, ui: ui.reducer }),
  ),
});

const engine = createSyncEngine(backend, createReduxAdapter(store));
engine.connect();
```

A store of a single slice wraps that slice's reducer the same way:
`withHomeostate(counter.reducer)`. The adapter dispatches `replaceState` on `store.dispatch`,
so remote changes go through the middleware.

### Handling the replace action yourself

A reducer case that handles the replace action must return the payload as is: it is the
whole root state. A slice used as the root reducer can handle it in its extra reducers
instead of being wrapped:

```ts
import { replaceState } from "@homeostate/store-redux";

type CounterState = { count: number };

const counter = createSlice({
  name: "counter",
  initialState: { count: 0 } as CounterState,
  reducers: {
    increment: (state) => {
      state.count++;
    },
  },
  extraReducers: (builder) =>
    builder.addCase(
      replaceState<CounterState>,
      (_state, action) => action.payload,
    ),
});
```

A store that already has a replace action of its own passes its action creator instead:
`createReduxAdapter(store, todos.actions.replaced)`. Only the action's `type` is required.

### DevTools and Redux Toolkit checks

Every remote change dispatches an action of type `REPLACE_STATE`,
`"@homeostate/replaceState"`, whose payload is the whole state. To hide it from the Redux
DevTools log, add it to `actionsDenylist`; to keep Redux Toolkit's serializable check from
walking that payload on every remote change, add it to `serializableCheck.ignoredActions`:

```ts
import { homeostate, REPLACE_STATE } from "@homeostate/store-redux";

const store = configureStore({
  reducer: rootReducer,
  devTools: { actionsDenylist: [REPLACE_STATE] },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { ignoredActions: [REPLACE_STATE] },
    }),
  enhancers: (getDefaultEnhancers) =>
    getDefaultEnhancers().prepend(homeostate({ backend })),
});
```

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
