---
description: localStorage persistence adapter for @homeostate/core
label: Introduction
---

# @homeostate/persist-local-storage

localStorage storage for `createPersistence` from
[`@homeostate/core`](../../core/docs/introduction.md). It keeps a Yjs, Loro or Automerge
document in the browser, so its state survives reloads, offline starts and every peer leaving
the room.

## Install

```bash install
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

Connect the engine after `whenLoaded`, so it adopts the restored state instead of seeding the
store's defaults over it. See the [persistence guide](/docs/persistence) for the whole flow.

## Options

```ts
createLocalStorageAdapter({
  prefix: "homeostate:", // prepended to every key
  storage: sessionStorage, // defaults to localStorage
});
```

## Limits

Each document is one JSON entry holding its updates in base64, rewritten on every update.
Browsers allow about 5 MB per origin; a write past that fails and is reported through
`createPersistence`'s `onError`. For larger documents use
[`@homeostate/persist-indexeddb`](../../persist-indexeddb/docs/introduction.md).
