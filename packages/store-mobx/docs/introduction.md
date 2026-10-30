---
description: Keep chosen properties of a MobX observable store in sync with a Yjs, Loro or Automerge document.
label: Introduction
---

# @homeostate/store-mobx

[MobX](https://mobx.js.org) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps the observable fields of a store in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
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

A remote change is reconciled into the observable tree instead of being assigned over it:
only the fields, array elements and keys that differ are written, inside one action. Items
that did not change keep their identity, so `observer` components, reactions and effects
that depend on them stay quiet.

When a peer removes a synced key, the adapter deletes it from an `observable({...})` object.
A class field made observable by `makeObservable` or `makeAutoObservable` cannot be deleted,
so it is set to `undefined` instead; type such fields as optional. A synced key holding
`undefined` counts as absent, as in JSON, so assigning the field again syncs it again.

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

## Errors

The engine writes a local change from inside the adapter's MobX `reaction`. MobX catches what a
reaction throws, so without the engine's `onError` option a backend `write` that fails never
reaches the code that changed the store: the action returns normally, MobX logs the error with
`console.error`, and the backend keeps its old value until the next successful write. Pass
`onError` to handle it yourself; MobX then logs nothing:

```ts
const engine = syncMobxStore(store, {
  backend: createYjsBackend(new Y.Doc(), "shared"),
  omit: ["draft"],
  onError: (error, source) => reportSyncError(error, source),
});
```

A remote change is applied outside any reaction, so without `onError` an error from it
propagates to the provider as with any other store. See
[Reporting errors](../../core/docs/sync-engine.md#reporting-errors).
