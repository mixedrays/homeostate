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

The adapter applies remote changes by dispatching an action that replaces the whole state,
so add a reducer for it and pass its action creator:

```ts
import * as Y from "yjs";
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createReduxAdapter } from "@homeostate/store-redux";

type CounterState = { count: number };

const counter = createSlice({
  name: "counter",
  initialState: { count: 0 } as CounterState,
  reducers: {
    increment: (state) => {
      state.count++;
    },
    replaceState: (_state, action: PayloadAction<CounterState>) =>
      action.payload,
  },
});

const store = configureStore({ reducer: counter.reducer });

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createReduxAdapter(store, counter.actions.replaceState),
);
engine.connect();
```

Immer-frozen state is fine: the engine never mutates store state in place. Local changes
are sent only when a dispatch produces a new state object.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
