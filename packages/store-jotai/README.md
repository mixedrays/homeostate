# @homeostate/store-jotai

[![npm](https://img.shields.io/npm/v/@homeostate/store-jotai?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-jotai)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-jotai?externals=@homeostate/core,jotai&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-jotai&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22jotai%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-jotai?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-jotai)
[![license](https://img.shields.io/npm/l/@homeostate/store-jotai?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-jotai/LICENSE)

[Jotai](https://jotai.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a writable atom, or a record of atoms, in sync with a CRDT backend such as Yjs, Loro
or Automerge.

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

The store argument defaults to Jotai's default store; pass the one you give `<Provider>` if
you use one. To sync several atoms, pass a record of them; the state is typed from the atoms:

```ts
// StoreAdapter<{ todos: Todo[]; filter: string }>
createJotaiAdapter({ todos: todosAtom, filter: filterAtom }, store);
```

A key a peer removes resets its atom to its initial value. A key the room holds that the record
does not list is removed by the next write, even with the sync engine's `keys` option, so every
peer sharing a room should sync the same set of atoms. See the
[documentation](https://homeostate.pages.dev/docs/store-jotai/introduction) for how removed keys
sync, and for a custom root atom that fans a replacement out to several atoms.

To tie sync to mounting instead of connecting at import, wrap the atom, or a record of atoms, in
`atomWithSync` (Jotai 2.12 or later). It connects when the returned atom is first mounted and
disconnects when its last subscriber unmounts:

```ts
import { atomWithSync } from "@homeostate/store-jotai";

const syncedAtom = atomWithSync(
  { todos: todosAtom, filter: filterAtom },
  { backend: createYjsBackend(new Y.Doc(), "todos") },
);
```

Only mounting the returned atom starts sync; reading a record's atom or the wrapped target does
not. Each mount is a reconnect, so edits made while unmounted are dropped for keys the backend
holds. An `atomWithSync` atom syncs one store at a time, and mounting it in a second store while
the first is mounted throws. If connecting throws, the error reaches whoever mounted the atom,
and that store stays unsynced until it is discarded. See the
[documentation](https://homeostate.pages.dev/docs/store-jotai/introduction) for mounting it from
a small component and for syncing two stores at once.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
