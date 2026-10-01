---
description: Loro CRDT backend for @homeostate/core
label: Introduction
---

# @homeostate/crdt-loro

[Loro](https://github.com/loro-dev/loro) backend for
[`@homeostate/core`](../../core/docs/introduction.md). It maps the synced state onto a
`LoroMap` (objects become `LoroMap`, arrays `LoroList`, strings `LoroText`) and commits
fine-grained operations as one transaction per write, so a middle-of-array delete, a toggle or
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
edits alike. Loro stores `undefined` as `null`, so such values read back as `null`.

## Persistence

Pass `createLoroPersistable(doc)` to `createPersistence`. It stores a snapshot plus the
update of each commit or import since. See the [persistence guide](/docs/persistence).
