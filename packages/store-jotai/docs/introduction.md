---
description: Keep a writable Jotai atom, or a record of atoms, in sync with a Yjs, Loro or Automerge document.
label: Introduction
---

# @homeostate/store-jotai

[Jotai](https://jotai.org) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a writable atom, or a record of atoms, in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
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

To sync state spread across several atoms, pass a record of atoms. The state is typed from
the atoms, one top-level key per atom:

```ts
type Todo = { id: string; title: string };
type Filter = "all" | "active" | "completed";

const todosAtom = atom<Todo[]>([]);
const filterAtom = atom<Filter>("all");

// StoreAdapter<{ todos: Todo[]; filter: Filter }>
createJotaiAdapter({ todos: todosAtom, filter: filterAtom }, store);
```

Each atom must accept a full replacement of its value, as primitive, `atomWithReset` and
`atomWithStorage` atoms do; a read-only atom fails to compile. A remote change sets every atom it
changes in one `store.set`, so a subscriber hears one notification, and the atoms it leaves alone
keep their value and are not written.

An `undefined` value counts as an absent key, as in JSON. When a peer removes a key, its atom is
reset to its initial value, and the sync engine writes that value back, as it writes anything the
store normalises, so the key returns on every peer. An atom without an initial value, such as a
derived writable atom, keeps its value instead, which is written back the same way. Only an atom
whose initial value is `undefined`, such as `atom<string>()`, keeps the key absent. So setting an
atom with another initial value to `undefined` resets it to that value on every peer, this one
included.

The record's keys are the whole synced state: a key the backend holds that the record does not
list, such as one a peer running a newer version of the app adds, is removed by the next write.
Passing the sync engine's `keys` option does not prevent this, so every peer sharing a room should
sync the same set of atoms.

For a custom root, pass a derived writable atom that reads the atoms and fans a replacement out to
each. Its write receives the whole remote state, which lacks any key a peer removed, so give each
atom a fallback rather than setting it to `undefined`:

```ts
const syncedAtom = atom(
  (get) => ({ todos: get(todosAtom), filter: get(filterAtom) }),
  (_get, set, next: { todos: Todo[]; filter: Filter }) => {
    set(todosAtom, next.todos ?? []);
    set(filterAtom, next.filter ?? "all");
  },
);

createJotaiAdapter(syncedAtom, store);
```
