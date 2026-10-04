---
description: Loro CRDT backend for @homeostate/core
label: Introduction
---

# @homeostate/crdt-loro

[Loro](https://github.com/loro-dev/loro) backend for
[`@homeostate/core`](../../core/docs/introduction.md). It maps the synced state onto a
`LoroMap` (objects become `LoroMap`, arrays `LoroList`, and strings plain values or, where you
choose, `LoroText`) and commits fine-grained operations as one transaction per write, so a middle-of-array delete, a toggle or
a keystroke each produce one small update.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-loro loro-crdt
```

`loro-crdt` ships WebAssembly; for bundler setup see
[Loro's documentation](https://loro.dev/docs).

## Usage

```ts
import { LoroDoc } from "loro-crdt";
import { createSyncEngine } from "@homeostate/core";
import { createLoroBackend } from "@homeostate/crdt-loro";

const doc = new LoroDoc();
const engine = createSyncEngine(createLoroBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap("shared")`. Replication is yours to wire, for example:

```ts
doc.subscribeLocalUpdates((update) => send(update));
onMessage((update) => doc.import(update));
```

The engine picks up every commit that did not come through its own write, imports and local
edits alike.

`undefined` and functions are not JSON, so the backend leaves out object entries holding
either and stores such array items as `null`, as `JSON.stringify` does.

## Strings and text

Strings are plain values by default, so two peers changing an id, a status or a timestamp at
once keep one of the two values. Pass `text` to store chosen strings as `LoroText`, whose
concurrent edits merge character by character:

```ts
const backend = createLoroBackend(doc, "shared", {
  text: (path) => path[0] === "todos" && path[2] === "title",
});
```

`text` receives the path from the synced map, such as `["todos", 0, "title"]`. `read()`
returns plain strings either way. Give every backend writing to the document the same policy.
A string held as the other kind, such as a `LoroText` written by an earlier release, reads as
usual and is stored as the configured kind when it next changes. See
[Strings and text](/docs/concepts#strings-and-text).

## Persistence

Pass `createLoroPersistable(doc)` to `createPersistence`. It stores a snapshot plus the
update of each commit or import since. See the [persistence guide](/docs/persistence).
