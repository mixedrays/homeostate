# @homeostate/store-zustand

[![npm](https://img.shields.io/npm/v/@homeostate/store-zustand?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-zustand)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-zustand?externals=@homeostate/core,zustand&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-zustand&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22zustand%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-zustand?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-zustand)
[![license](https://img.shields.io/npm/l/@homeostate/store-zustand?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-zustand/LICENSE)

[Zustand](https://github.com/pmndrs/zustand) store adapter and middleware for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a Zustand store in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-zustand zustand @homeostate/crdt-yjs yjs
```

`zustand` 4.5 or 5 is a peer dependency.

## Usage

Wrap the state creator with the `homeostate` middleware. The store connects as soon as it
is created, or once `persist` has hydrated it, and the engine is exposed as `store.homeostate`:

```ts
import * as Y from "yjs";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

const doc = new Y.Doc();
const useCounter = create<CounterState>()(
  homeostate(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { backend: createYjsBackend(doc, "shared") },
  ),
);

useCounter.homeostate.disconnect(); // stop syncing
```

The second argument holds the options, as in Zustand's own middlewares:

| Option                                                  | Default  | Description                                                          |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `backend`                                               |          | The `CrdtBackend` the store syncs with                               |
| `connect`                                               | `"auto"` | `"manual"` leaves `store.homeostate.connect()` to the app; see below |
| `omit`, `keys`, `filter`, `seed`, `schedule`, `onError` |          | The engine's `SyncEngineConfig`, typed by the store's state          |

`omit` and `keys` take the state's key names, so `{ backend, omit: ["draft"] }` keeps a draft
on each device, and a misspelled key fails to compile.

### Connecting later

With `connect: "manual"`, the store is created without touching the backend, and the app
connects it when it is ready, for example once its provider has received the room's state:

```ts
const useCounter = create<CounterState>()(
  homeostate(creator, {
    backend: createYjsBackend(doc, "shared"),
    connect: "manual",
  }),
);

provider.once("sync", () => useCounter.homeostate.connect());
```

Until then the store works locally. Connecting then works as on any `connect()`: the room's
values replace the store's for every key the room holds, edits made meanwhile included, and
keys the room lacks seed it.

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

Only data is synced; actions and other functions in the state are skipped.

## Combining with other middlewares

Put `persist` inside `homeostate`:

```ts
import { createJSONStorage, persist } from "zustand/middleware";

const useCounter = create<CounterState>()(
  homeostate(
    persist(
      (set) => ({
        count: 0,
        increment: () => set((state) => ({ count: state.count + 1 })),
      }),
      { name: "counter", storage: createJSONStorage(() => localStorage) },
    ),
    { backend: createYjsBackend(doc, "shared") },
  ),
);
```

| Middleware              | Order                                       | Notes                                         |
| ----------------------- | ------------------------------------------- | --------------------------------------------- |
| `persist`               | Inside: `homeostate(persist(...), options)` | Outside, creating the store throws            |
| `devtools`              | Either; outermost, as Zustand recommends    | Remote changes show up as `anonymous` actions |
| `immer`                 | Either                                      |                                               |
| `subscribeWithSelector` | Either                                      |                                               |

All four together:

```ts
devtools(
  subscribeWithSelector(
    homeostate(persist(immer(creator), persistOptions), { backend }),
  ),
);
```

`persist` outside `homeostate` hydrates the store only after the middleware has connected it,
so the creator's state would overwrite storage, or the persisted state the room. The middleware
detects that order and throws when the store is created, naming the right one.

With `persist` inside, the store connects once it is hydrated: at once with synchronous
storage such as `localStorage`, and after the read with asynchronous storage such as React
Native's `AsyncStorage` or an IndexedDB wrapper. Until then `store.homeostate.isConnected()`
is `false`. Calling `store.homeostate.disconnect()` cancels the pending connect, and calling
`store.homeostate.connect()`, as with `connect: "manual"`, connects once hydration has
finished. If hydration fails, the store stays disconnected, and Zustand passes the error to
the callback returned by `onRehydrateStorage`; `store.persist.rehydrate()` retries, and the
store connects once it succeeds.

Connecting then works as on any `connect()`: the room wins over the persisted state, and
persisted keys the room lacks seed it. So edits persisted while offline are lost when the room
already has state; keeping them across a reconnect is not supported yet. For offline apps,
persist the CRDT document with
[`createPersistence`](https://homeostate.pages.dev/docs/persistence) instead of the store: the
document records offline edits and merges them with the room's.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
