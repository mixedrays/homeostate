---
description: Automerge CRDT backend for @homeostate/core
label: Introduction
---

# @homeostate/crdt-automerge

[Automerge](https://automerge.org) backend for
[`@homeostate/core`](../../core/docs/introduction.md). It maps the synced state onto one key of
an Automerge document (objects become maps, arrays lists, strings text) and writes
fine-grained operations as one Automerge change per write, so a middle-of-array delete, a
toggle or a keystroke each produce one small change.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-automerge @automerge/automerge
```

`@automerge/automerge` 3.x is a peer dependency. It ships WebAssembly, which Node loads
directly; for bundler setup see [Automerge's documentation](https://automerge.org/docs/).

## Usage

Automerge documents are immutable values: every change returns a new document. A handle
holds the current one, so the backend and your replication code share it:

```ts
import * as A from "@automerge/automerge";
import { createSyncEngine } from "@homeostate/core";
import {
  createAutomergeBackend,
  createAutomergeHandle,
} from "@homeostate/crdt-automerge";

const handle = createAutomergeHandle(A.init());
const engine = createSyncEngine(
  createAutomergeBackend(handle, "shared"),
  adapter,
);
engine.connect();

// Replication is yours to wire, for example:
handle.subscribe(({ doc, local }) => {
  if (local) send(A.getLastLocalChange(doc));
});
onMessage((change) => handle.update((doc) => A.applyChanges(doc, [change])[0]));
```

- `handle.doc()` returns the current document; the synced state is `handle.doc().shared`.
- `handle.change(fn)` applies a local change through `A.change`.
- `handle.update((doc) => ...)` replaces the document with the result of `A.merge`,
  `A.applyChanges`, `A.loadIncremental`, `A.receiveSyncMessage` or any other Automerge call.
- `handle.subscribe(({ doc, local }) => ...)` fires whenever the heads change; `local` is
  true for `change` and false for `update`.

The engine picks up every change that did not come through its own write, imports and local
edits alike.

`undefined` is not JSON and Automerge rejects it, so the backend drops object entries whose
value is `undefined` and stores `undefined` array items as `null`, as `JSON.stringify` does.
Snapshots from `read()` copy only what changed since the last read and are shared between
reads, so treat them as immutable.

## Persistence

Pass `createAutomergePersistable(handle)` to `createPersistence`. It stores `A.save` of the
document plus the changes of each update since. See the
[persistence guide](/docs/persistence).
