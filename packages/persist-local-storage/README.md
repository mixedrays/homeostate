# @homeostate/persist-local-storage

[![npm](https://img.shields.io/npm/v/@homeostate/persist-local-storage?color=2563eb)](https://www.npmjs.com/package/@homeostate/persist-local-storage)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fpersist-local-storage?externals=@homeostate/core&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fpersist-local-storage&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/persist-local-storage?color=2563eb)](https://www.npmjs.com/package/@homeostate/persist-local-storage)
[![license](https://img.shields.io/npm/l/@homeostate/persist-local-storage?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/persist-local-storage/LICENSE)

localStorage storage for `createPersistence` from
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core). It keeps
a Yjs, Loro or Automerge document in the browser, so its state survives reloads, offline starts
and every peer leaving the room.

## Install

```bash
npm install @homeostate/core @homeostate/persist-local-storage @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createPersistence, createSyncEngine } from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createLocalStorageAdapter } from "@homeostate/persist-local-storage";

const doc = new Y.Doc();
const persistence = createPersistence(
  createYjsPersistable(doc),
  createLocalStorageAdapter(),
  { key: "todos" },
);

await persistence.whenLoaded;
createSyncEngine(createYjsBackend(doc, "shared"), adapter).connect();
```

Connect the engine after `whenLoaded`, or pass it as the engine's `ready` option, so it adopts the
restored state instead of seeding the store's defaults over it. Its result tells whether a stored document was found and restored in
full; see the [persistence guide](https://homeostate.pages.dev/docs/persistence#checking-what-was-restored).

`createLocalStorageAdapter({ prefix, storage, coordination })` takes an optional key prefix
(default `"homeostate:"`), storage, such as `sessionStorage`, and how writers in other tabs are
coordinated.

By default, `coordination: "locks"`, each append, compaction and clear holds a
[Web Lock](https://developer.mozilla.org/docs/Web/API/Web_Locks_API) for its key while it
rewrites the entry, so several tabs can persist the same key without overwriting each other's
updates. Browsers provide Web Locks in secure contexts only, https and `localhost`: on a page
opened over plain http from another address, such as a LAN IP, those calls reject with an error
saying so. Serve the page over https, or pass `coordination: "single-writer"` when only one tab
writes the storage, as with `sessionStorage`; then two tabs writing one key at once can lose
updates.

Browsers allow about 5 MB per origin, and each document is rewritten on every update. For
larger documents use
[`@homeostate/persist-indexeddb`](https://github.com/mixedrays/homeostate/tree/main/packages/persist-indexeddb).

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
