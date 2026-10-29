# @homeostate/store-redux

[![npm](https://img.shields.io/npm/v/@homeostate/store-redux?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-redux)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-redux?externals=@homeostate/core&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-redux&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-redux?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-redux)
[![license](https://img.shields.io/npm/l/@homeostate/store-redux?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-redux/LICENSE)

[Redux](https://redux.js.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a Redux store in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-redux @reduxjs/toolkit @homeostate/crdt-yjs yjs
```

The package does not depend on `redux`: the adapter takes any store with Redux's `getState`,
`dispatch` and `subscribe`. Redux Toolkit, Redux 4 and Redux 5 stores work, and so does a
store made with Zustand's `redux` middleware. For a plain Redux store, install `redux` instead
of `@reduxjs/toolkit`.

## Usage

The adapter applies remote changes by dispatching `replaceState`, an action that replaces the
whole root state. Wrap the root reducer in `withHomeostate` to handle it, whatever its shape:

```ts
import * as Y from "yjs";
import { combineReducers, configureStore, createSlice } from "@reduxjs/toolkit";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createReduxAdapter, withHomeostate } from "@homeostate/store-redux";

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
  reducer: withHomeostate(
    combineReducers({ counter: counter.reducer, ui: ui.reducer }),
  ),
});

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createReduxAdapter(store),
);
engine.connect();
```

A store of a single slice wraps that slice's reducer the same way:
`withHomeostate(counter.reducer)`.

Immer-frozen state is fine: the engine never mutates store state in place. Local changes
are sent only when a dispatch produces a new state object.

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
import { REPLACE_STATE, withHomeostate } from "@homeostate/store-redux";

const store = configureStore({
  reducer: withHomeostate(rootReducer),
  devTools: { actionsDenylist: [REPLACE_STATE] },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { ignoredActions: [REPLACE_STATE] },
    }),
});
```

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
