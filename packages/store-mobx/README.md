# @homeostate/store-mobx

[MobX](https://mobx.js.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps chosen properties of an observable store in sync with a CRDT backend such as Yjs, Loro or Automerge.

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

Remote changes write only what differs, inside one action, so unchanged items keep their
identity and `observer` components that read them do not re-render.

When a peer removes a synced key, a class field cannot be deleted, so it is set to
`undefined`; type such fields as optional.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
