# @homeostate/persist-indexeddb

[![npm](https://img.shields.io/npm/v/@homeostate/persist-indexeddb?color=2563eb)](https://www.npmjs.com/package/@homeostate/persist-indexeddb)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fpersist-indexeddb?externals=@homeostate/core&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fpersist-indexeddb&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/persist-indexeddb?color=2563eb)](https://www.npmjs.com/package/@homeostate/persist-indexeddb)
[![license](https://img.shields.io/npm/l/@homeostate/persist-indexeddb?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/persist-indexeddb/LICENSE)

IndexedDB storage for `createPersistence` from
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core). It keeps
a Yjs, Loro or Automerge document in the browser, so its state survives reloads, offline starts
and every peer leaving the room.

## Install

```bash
npm install @homeostate/core @homeostate/persist-indexeddb @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createPersistence, createSyncEngine } from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createIndexedDbAdapter } from "@homeostate/persist-indexeddb";

const doc = new Y.Doc();
const persistence = createPersistence(
  createYjsPersistable(doc),
  createIndexedDbAdapter(),
  { key: "todos" },
);

await persistence.whenLoaded;
createSyncEngine(createYjsBackend(doc, "shared"), adapter).connect();
```

Connect the engine after `whenLoaded`, so it adopts the restored state instead of seeding the
store's defaults over it. See the [persistence guide](https://homeostate.pages.dev/docs/persistence).

`createIndexedDbAdapter({ name, indexedDB })` takes an optional database name (default
`"homeostate"`) and IndexedDB implementation, such as `fake-indexeddb` in tests. Several tabs
can persist the same key safely.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
