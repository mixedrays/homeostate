# @homeostate/store-mobx

> **Early release.** The API is still being designed and may change in any `0.x` minor
> version.

[MobX](https://mobx.js.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps chosen properties of an observable store in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-yjs),
[`@homeostate/crdt-loro`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-loro), or
[`@homeostate/crdt-automerge`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-automerge).

## Install

```bash
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

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
