---
description: Yjs CRDT backend for @homeostate/core
label: Introduction
---

# @homeostate/crdt-yjs

[Yjs](https://github.com/yjs/yjs) backend for
[`@homeostate/core`](../../core/docs/introduction.md). It maps the synced state onto a `Y.Map`
(objects become `Y.Map`, arrays `Y.Array`, and strings plain values or, where you choose,
`Y.Text`) and writes fine-grained operations, so a middle-of-array delete, a toggle or a
keystroke each produce one small update.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const doc = new Y.Doc();
const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap("shared")`. Attach any Yjs provider, such as
[y-websocket](https://github.com/yjs/y-websocket), to `doc` for replication.

`undefined` and functions are not JSON, so the backend leaves out object entries holding
either and stores such array items as `null`, as `JSON.stringify` does.

## Strings and text

Strings are plain values by default, so two peers changing an id, a status or a timestamp at
once keep one of the two values. Pass `text` to store chosen strings as `Y.Text`, whose
concurrent edits merge character by character:

```ts
const backend = createYjsBackend(doc, "shared", {
  text: (path) => path[0] === "todos" && path[2] === "title",
});
```

`text` receives the path from the synced map, such as `["todos", 0, "title"]`. `read()`
returns plain strings either way. Give every backend writing to the document the same policy.
A string held as the other kind, such as a `Y.Text` written by an earlier release, reads as
usual and is stored as the configured kind when it next changes. See
[Strings and text](/docs/concepts#strings-and-text).

## Persistence

Pass `createYjsPersistable(doc)` to `createPersistence`. It stores Yjs updates, so every
shared type in the document is kept, not only the synced map. See the
[persistence guide](/docs/persistence).
