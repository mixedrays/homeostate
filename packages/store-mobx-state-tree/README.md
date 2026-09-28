# @homeostate/store-mobx-state-tree

[MobX-State-Tree](https://mobx-state-tree.js.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a state tree node in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-yjs),
[`@homeostate/crdt-loro`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-loro), or
[`@homeostate/crdt-automerge`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-automerge).

## Install

```bash
npm install @homeostate/core @homeostate/store-mobx-state-tree mobx mobx-state-tree @homeostate/crdt-yjs yjs
```

`mobx` 6 or 7 and `mobx-state-tree` 7 or 8 are peer dependencies.

## Usage

```ts
import * as Y from "yjs";
import { types } from "mobx-state-tree";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createMobxStateTreeAdapter } from "@homeostate/store-mobx-state-tree";

const Todo = types.model({
  id: types.identifier,
  title: types.string,
  done: false,
});

const TodoStore = types.model({ todos: types.array(Todo) }).actions((self) => ({
  add(title: string) {
    self.todos.push({ id: crypto.randomUUID(), title });
  },
}));

const store = TodoStore.create();

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createMobxStateTreeAdapter(store),
);
engine.connect();
```

The adapter syncs the node's snapshot: local changes go to the backend once per action, and
remote changes are applied with `applySnapshot`, so instances with an identifier are
reconciled in place instead of being recreated. Pass the root instance, or any subtree node
to sync only that part.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
