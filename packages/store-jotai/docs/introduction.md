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

## Tying sync to mounting

`atomWithSync` wraps a writable atom, or a record of atoms, so that sync follows Jotai's mounting
instead of starting at import. The returned atom reads and writes like its target, connects when
it is first mounted in a store and disconnects when its last subscriber unmounts:

```ts
import * as Y from "yjs";
import { atom } from "jotai";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { atomWithSync } from "@homeostate/store-jotai";

const counterAtom = atomWithSync(atom({ count: 0 }), {
  backend: createYjsBackend(new Y.Doc(), "shared"),
});

// { todos: Todo[]; filter: Filter }
const syncedAtom = atomWithSync(
  { todos: todosAtom, filter: filterAtom },
  { backend: createYjsBackend(new Y.Doc(), "todos") },
);
```

The options are the `backend`, a `CrdtBackend` instance, and the sync engine's config, with key
names checked against the state. There is no `connect` option, and no engine to reach: for a
status display or a manual `connect()`, use `createJotaiAdapter` with `createSyncEngine`.
`atomWithSync` needs Jotai 2.12 or later, while `createJotaiAdapter` works with every Jotai the
package supports. It uses the store of whoever mounts it, so `<Provider>` needs no extra setup.

> [!IMPORTANT]
> Only mounting the returned atom, or an atom derived from it, starts sync. Reading a record's
> atom or the wrapped target does not, even from a mounted component.

When components read the record's atoms directly, mount the returned atom in a small component
of its own. It re-renders on every change, which stays inside it:

```tsx
function SyncTodos() {
  useAtomValue(syncedAtom);
  return null;
}
```

The first render shows the atoms' initial values, since the atom connects after that render and
then adopts what the room holds.

Each mount is a reconnect, which follows [the reconnect rule](/docs/concepts#connecting): edits
made to the atoms while unmounted are dropped for every key the backend holds. To edit offline,
keep the atom mounted and disconnect the CRDT library's provider instead.

If connecting throws, the error reaches whoever mounted the atom, and that store stays unsynced
until it is discarded.

Every peer sharing a room should sync the same set of atoms, as with the record form of
`createJotaiAdapter`.

One `atomWithSync` atom syncs one store at a time. Stores mounted one after another each sync,
with one engine per store, but mounting the atom in a second store while the first is mounted
throws: a backend skips its own writes for every subscriber, so the two stores would not hear
each other, and a store's edits would be lost. To sync two stores at once, call `atomWithSync`
once per store, each with its own backend on the same document:

```ts
const doc = new Y.Doc();
const leftAtom = atomWithSync(todosAtom, {
  backend: createYjsBackend(doc, "todos"),
});
const rightAtom = atomWithSync(todosAtom, {
  backend: createYjsBackend(doc, "todos"),
});
```
