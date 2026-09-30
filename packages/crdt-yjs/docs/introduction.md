---
description: Yjs CRDT backend for @homeostate/core
label: Introduction
---

# @homeostate/crdt-yjs

[Yjs](https://github.com/yjs/yjs) backend for
[`@homeostate/core`](../../core/docs/introduction.md).
It maps the synced state onto a `Y.Map` (nested objects become `Y.Map`, arrays `Y.Array`,
strings `Y.Text`) and writes fine-grained operations derived from `getChanges`.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

`yjs` is a peer dependency.

## Usage

```ts
import * as Y from "yjs";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const doc = new Y.Doc();
const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap('shared')`; a middle-of-array delete, a toggle, or a
keystroke each produce one small update.

## Persistence

`createYjsPersistable(doc)` exposes the whole document to `createPersistence`, which keeps it in
storage such as [`@homeostate/persist-indexeddb`](../../persist-indexeddb/docs/introduction.md) so it outlives
every peer and the server:

```ts
const persistence = createPersistence(
  createYjsPersistable(doc),
  createIndexedDbAdapter(),
  {
    key: "room",
  },
);
await persistence.whenLoaded;
engine.connect();
```

It stores Yjs updates, so every shared type in the document is kept, not only the synced map. See the [persistence guide](/docs/persistence).
