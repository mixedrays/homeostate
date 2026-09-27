---
description: Loro CRDT backend for @homeostate/core
label: Introduction
---

# @homeostate/crdt-loro

> [!WARNING]
> **Draft / placeholder release.** `0.0.0` reserves the name while the API is still
> being designed. Nothing here is stable — do not depend on it yet.

[Loro](https://github.com/loro-dev/loro) backend for
[`@homeostate/core`](../../core/docs/introduction.md).
It maps the synced state onto a `LoroMap` (nested objects become `LoroMap`, arrays
`LoroList`, strings `LoroText`) and writes fine-grained operations derived from
`getChanges`, committed as one transaction per `write`.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-loro loro-crdt
```

`loro-crdt` is a peer dependency.

## Usage

```ts
import { LoroDoc } from "loro-crdt";
import { createSyncEngine } from "@homeostate/core";
import { createLoroBackend } from "@homeostate/crdt-loro";

const doc = new LoroDoc();
const engine = createSyncEngine(createLoroBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap('shared')`; a middle-of-array delete, a toggle, or a
keystroke each produce one small update. Replication is yours to wire, for example with
`doc.subscribeLocalUpdates` on one side and `doc.import` on the other. The engine hears
about every commit that did not come through its own `write`, imports and local edits alike.

Loro stores `undefined` as `null`, so such values read back as `null`.
