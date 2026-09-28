---
description: State-manager and CRDT-backend agnostic sync engine between a store adapter and a CrdtBackend
label: Introduction
---

# @homeostate/core

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

`createMemoryBackend()` from `@homeostate/core/testing` is a plain-JSON backend without
replication, meant for tests.
`getChanges` is exported so a backend can turn a `write(next)` into fine-grained operations.

## Applying string changes

String changes from `getChanges` use UTF-16 offsets into the progressively edited string,
matching JavaScript string indexing. The diff compares whole Unicode code points so an edit
does not split a valid surrogate pair. It does not treat a multi-code-point grapheme, such as
a joined emoji or a letter with combining marks, as one indivisible character.

For a string `DELETE`, the third tuple entry is the number of UTF-16 units to remove;
`undefined` means one unit. Custom backends must honor this length in one operation:

```ts
getChanges("😀a😃b", "😀ab");
// [[ChangeType.DELETE, 3, 2]] — remove the whole 😃 surrogate pair
```

Inserts carry complete strings. Array and object deletes still carry `undefined` and remove
one element or property. Core's `applyChanges` and the supplied CRDT backends handle string
deletion lengths; an external backend using a different text-index unit must translate both
offsets and lengths before applying them.

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
