---
description: IndexedDB persistence adapter for @homeostate/core
label: Introduction
---

# @homeostate/persist-indexeddb

IndexedDB storage for `createPersistence` from
[`@homeostate/core`](../../core/docs/introduction.md). It keeps a Yjs, Loro or Automerge
document in the browser, so its state survives reloads, offline starts and every peer leaving
the room.

## Install

```bash install
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
store's defaults over it. See the [persistence guide](/docs/persistence) for the whole flow.

## Options

```ts
createIndexedDbAdapter({
  name: "homeostate", // database name
  indexedDB: indexedDB, // IndexedDB implementation, such as fake-indexeddb in tests
});
```

All documents share one database; `key` keeps them apart. Each update is one row, and each
operation is one transaction, so several tabs can persist the same key safely. `close()`
closes the connection; the next call reopens it.
