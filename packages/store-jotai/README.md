# @homeostate/store-jotai

[Jotai](https://jotai.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a writable atom in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-yjs),
[`@homeostate/crdt-loro`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-loro), or
[`@homeostate/crdt-automerge`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-automerge).

## Install

```bash
npm install @homeostate/core @homeostate/store-jotai jotai @homeostate/crdt-yjs yjs
```

`jotai` 2 or 3 is a peer dependency.

## Usage

The adapter syncs one writable atom that holds the whole synced state and accepts a full
replacement:

```ts
import * as Y from "yjs";
import { atom, createStore } from "jotai";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createJotaiAdapter } from "@homeostate/store-jotai";

const counterAtom = atom({ count: 0 });
const store = createStore();

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createJotaiAdapter(counterAtom, store),
);
engine.connect();
```

The store argument is optional and defaults to Jotai's default store. Pass the same store
you give `<Provider store={store}>` if you use one.

To sync state spread across several atoms, pass a derived writable atom that reads them
and fans a replacement out to each:

```ts
type Todo = { id: string; title: string };

const todosAtom = atom<Todo[]>([]);
const filterAtom = atom("all");

const syncedAtom = atom(
  (get) => ({ todos: get(todosAtom), filter: get(filterAtom) }),
  (_get, set, next: { todos: Todo[]; filter: string }) => {
    set(todosAtom, next.todos);
    set(filterAtom, next.filter);
  },
);

createJotaiAdapter(syncedAtom, store);
```

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
