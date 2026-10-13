---
description: Keep a Zustand store in sync with a Yjs, Loro or Automerge document, with the homeostate middleware or an adapter for an existing store.
label: Introduction
---

# @homeostate/store-zustand

[Zustand](https://github.com/pmndrs/zustand) store adapter and middleware for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a Zustand store in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-zustand zustand @homeostate/crdt-yjs yjs
```

`zustand` 4.5 or 5 is a peer dependency.

## Usage

Wrap the state creator with the `homeostate` middleware. The store connects as soon as it
is created, or once [`persist`](#combining-with-other-middlewares) has hydrated it, and the
engine is exposed as `store.homeostate`:

```ts
import * as Y from "yjs";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

const doc = new Y.Doc();
const useCounter = create<CounterState>()(
  homeostate(createYjsBackend(doc, "shared"), (set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  })),
);

useCounter.homeostate.disconnect(); // stop syncing
```

The optional third argument is the engine's
[`SyncEngineConfig`](../../core/docs/sync-engine.md#syncengineconfig) (`filter`, `seed`,
`schedule`).

To sync a store you already have, create the engine yourself with `createZustandAdapter`:

```ts
import { createSyncEngine } from "@homeostate/core";
import { createZustandAdapter } from "@homeostate/store-zustand";

const engine = createSyncEngine(
  createYjsBackend(doc, "shared"),
  createZustandAdapter(useCounter),
);
engine.connect();
```

Only data is synced: the default filter skips actions and other functions in the state, and
remote changes leave them in place.

## Combining with other middlewares

Put `persist` inside `homeostate`:

```ts
import { createJSONStorage, persist } from "zustand/middleware";

const useCounter = create<CounterState>()(
  homeostate(
    createYjsBackend(doc, "shared"),
    persist(
      (set) => ({
        count: 0,
        increment: () => set((state) => ({ count: state.count + 1 })),
      }),
      { name: "counter", storage: createJSONStorage(() => localStorage) },
    ),
  ),
);
```

| Middleware              | Order                                       | Notes                                         |
| ----------------------- | ------------------------------------------- | --------------------------------------------- |
| `persist`               | Inside: `homeostate(backend, persist(...))` | Outside, creating the store throws            |
| `devtools`              | Either; outermost, as Zustand recommends    | Remote changes show up as `anonymous` actions |
| `immer`                 | Either                                      |                                               |
| `subscribeWithSelector` | Either                                      |                                               |

All four together:

```ts
devtools(
  subscribeWithSelector(
    homeostate(backend, persist(immer(creator), persistOptions)),
  ),
);
```

`persist` outside `homeostate` hydrates the store only after the middleware has connected it,
so the creator's state would overwrite storage, or the persisted state the room. The middleware
detects that order and throws when the store is created, naming the right one.

With `persist` inside, the store connects once it is hydrated: at once with synchronous
storage such as `localStorage`, and after the read with asynchronous storage such as React
Native's `AsyncStorage` or an IndexedDB wrapper. Until then `store.homeostate.isConnected()`
is `false`, and calling `store.homeostate.connect()` or `disconnect()` cancels the pending
connect. If hydration fails, the store stays disconnected until you call
`store.homeostate.connect()`; Zustand passes the error to the callback returned by
`onRehydrateStorage`.

Connecting then works as on any [`connect()`](/docs/concepts#connecting): the room wins over
the persisted state, and persisted keys the room lacks seed it. So edits persisted while
offline are lost when the room already has state; keeping them across a reconnect is not
supported yet. For offline apps, persist the CRDT document with
[`createPersistence`](/docs/persistence) instead of the store: the document records offline
edits and merges them with the room's.
