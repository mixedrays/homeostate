# @homeostate/store-mobx

[![npm](https://img.shields.io/npm/v/@homeostate/store-mobx?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-mobx)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-mobx?externals=@homeostate/core,mobx&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-mobx&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22mobx%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-mobx?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-mobx)
[![license](https://img.shields.io/npm/l/@homeostate/store-mobx?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-mobx/LICENSE)

[MobX](https://mobx.js.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps the observable fields of a store in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-mobx mobx @homeostate/crdt-yjs yjs
```

`mobx` 6 or 7 is a peer dependency.

## Usage

Call `syncMobxStore` with the store and the backend. It creates the store adapter and the sync
engine, and returns the engine:

```ts
import * as Y from "yjs";
import { makeAutoObservable } from "mobx";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { syncMobxStore } from "@homeostate/store-mobx";

class TodoStore {
  todos: { id: string; title: string; done: boolean }[] = [];
  filter = "all";
  draft = "";

  constructor() {
    makeAutoObservable(this);
  }

  add() {
    this.todos.push({
      id: crypto.randomUUID(),
      title: this.draft,
      done: false,
    });
    this.draft = "";
  }
}

const store = new TodoStore();

const engine = syncMobxStore(store, {
  backend: createYjsBackend(new Y.Doc(), "shared"),
  omit: ["draft"],
});

engine.disconnect(); // stop syncing
engine.connect(); // sync again
```

The store connects before the helper returns: a room that already has state replaces the store's
synced fields, and an empty room is seeded from the store.

| Option                                  | Default  | Description                                                 |
| --------------------------------------- | -------- | ----------------------------------------------------------- |
| `backend`                               |          | The `CrdtBackend` the store syncs with                      |
| `connect`                               | `"auto"` | `"manual"` leaves `engine.connect()` to the app; see below  |
| `keys`, `omit`                          |          | The fields to sync, or those to keep local                  |
| `filter`, `seed`, `schedule`, `onError` |          | The engine's `SyncEngineConfig`, typed by the synced fields |

The helper syncs the store's observable data fields; computeds, actions and fields MobX does not
observe stay local, and so do the fields `omit` names, such as a `draft` each user types on their
own.

`keys` syncs only the fields it lists instead, as in
`syncMobxStore(store, { backend, keys: ["todos"] })`; it does not combine with `omit`. Both take
field names that TypeScript checks against the store, so a typo or a method name is a compile
error, and a list shared as an `as const` constant works. The synced state is typed as the
synced fields without the store's methods, `Pick<TodoStore, "todos" | "filter">` here. A
computed getter looks like a field to TypeScript, so the type includes it unless `omit` names
it; do not list one in `keys`.

Without `keys`, the helper finds the fields when it is called, as `createMobxAdapter` does, so
make the store observable first: a store that is not observable throws. A field added to the store
later is not synced.

A key the room holds outside the store's synced fields, such as one a peer running a newer version
of the app adds, is removed from the room. Passing `keys` does not prevent this, so every peer
sharing a room should sync the same fields.

Remote changes write only what differs, inside one action, so unchanged items keep their
identity and `observer` components that read them do not re-render.

When a peer removes a synced key, a class field cannot be deleted, so it is set to
`undefined`; type such fields as optional.

MobX catches errors thrown inside reactions, where the engine writes local changes, so a failed
backend write is only logged by MobX unless you pass the engine's `onError` option.

### Connecting later

With `connect: "manual"`, the helper lists the store's fields when it is called unless `keys`
names them, and no state is read or written until `connect()`, so the app connects when it is
ready, for example once its provider has received the room's state:

```ts
const engine = syncMobxStore(store, { backend, connect: "manual" });

provider.once("sync", () => engine.connect());
```

A field added afterwards to an `observable({...})` store is not synced unless `keys` names it.

### Without the helper

`syncMobxStore` creates the store adapter and the sync engine and connects them. Do it yourself
when something else needs the adapter, such as the devtools. `keys` and `omit` go to the adapter,
the rest of the options to the engine:

```ts
import { createSyncEngine } from "@homeostate/core";
import { createMobxAdapter } from "@homeostate/store-mobx";

const adapter = createMobxAdapter(store, { omit: ["draft"] });
const engine = createSyncEngine(backend, adapter);
engine.connect();
```

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
