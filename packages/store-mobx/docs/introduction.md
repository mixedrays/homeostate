---
description: MobX adapter for @homeostate/core
label: Introduction
---

# @homeostate/store-mobx

[MobX](https://mobx.js.org) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps chosen properties of an observable store in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-mobx mobx @homeostate/crdt-yjs yjs
```

`mobx` 6 or 7 is a peer dependency.

## Usage

Pass the store and the keys to sync. Everything else on the store stays local:

```ts
import * as Y from "yjs";
import { makeAutoObservable } from "mobx";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createMobxAdapter } from "@homeostate/store-mobx";

class TodoStore {
  todos: { id: string; title: string; done: boolean }[] = [];
  filter = "all";

  constructor() {
    makeAutoObservable(this);
  }

  add(title: string) {
    this.todos.push({ id: crypto.randomUUID(), title, done: false });
  }
}

const store = new TodoStore();

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createMobxAdapter(store, ["todos", "filter"]),
);
engine.connect();
```

A remote change is reconciled into the observable tree instead of being assigned over it:
only the fields, array elements and keys that differ are written, inside one action. Items
that did not change keep their identity, so `observer` components, reactions and effects
that depend on them stay quiet.

When a peer removes a synced key, the adapter deletes it from an `observable({...})` object.
A class field made observable by `makeObservable` or `makeAutoObservable` cannot be deleted,
so it is set to `undefined` instead; type such fields as optional. A synced key holding
`undefined` counts as absent, as in JSON, so assigning the field again syncs it again.
