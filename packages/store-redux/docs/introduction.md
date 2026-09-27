---
description: Redux adapter for @homeostate/core
label: Introduction
---

# @homeostate/store-redux

> [!WARNING]
> **Early release.** The API is still being designed and may change in any `0.x` minor
> version.

[Redux](https://redux.js.org) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a Redux store in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](../../crdt-yjs/docs/introduction.md),
[`@homeostate/crdt-loro`](../../crdt-loro/docs/introduction.md), or
[`@homeostate/crdt-automerge`](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-redux @reduxjs/toolkit @homeostate/crdt-yjs yjs
```

`redux` 5 is a peer dependency; Redux Toolkit 2 already depends on it.

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
