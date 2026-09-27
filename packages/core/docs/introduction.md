---
description: State-manager and CRDT-backend agnostic sync engine between a store adapter and a CrdtBackend
label: Introduction
---

# @homeostate/core

> [!WARNING]
> **Draft / placeholder release.** `0.0.0` reserves the name while the API is still
> being designed. Nothing here is stable — do not depend on it yet.

State-manager and CRDT-backend agnostic sync engine. It keeps a store, reached through a
`StoreAdapter`, in sync with a `CrdtBackend` such as
[`@homeostate/crdt-yjs`](../../crdt-yjs/docs/introduction.md),
[`@homeostate/crdt-loro`](../../crdt-loro/docs/introduction.md), or
[`@homeostate/crdt-automerge`](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

`@homeostate/core` has no runtime dependencies; pick a backend package for the CRDT library
you use.

## Usage

```ts
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter, {
  seed: "if-empty",
});
engine.connect();
```

`createMemoryBackend()` is a plain-JSON backend without replication, meant for tests.
`getChanges` is exported so a backend can turn a `write(next)` into fine-grained operations.

## Connecting

`connect()` reconciles the store and the backend per key, over the view the `filter` allows:

- A key the backend holds wins over the store's value, so a peer joining a populated room
  adopts it rather than overwriting it.
- A synced key the backend does not hold stays in the store. With the default
  `seed: 'if-empty'` those keys are written into the backend in one write; with
  `seed: 'never'` they are left to the next local change.
- Keys the `filter` excludes are never read into the store and never written out.

Afterwards the backend owns the synced document: each local change replaces it with the
store's filtered state, and a key removed from the backend is removed from the store. A
reconnect adopts the backend again, so edits made while disconnected are dropped unless
they are still in the store's local-only keys.

See the [repository](https://github.com/mixedrays/homeostate) for the full workspace,
store adapters, and a runnable playground.
