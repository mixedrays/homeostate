---
description: NgRx Signals adapter for @homeostate/core, for signalState and signalStore
label: Introduction
---

# @homeostate/store-ngrx-signals

[NgRx Signals](https://ngrx.io/guide/signals) adapter for
[`@homeostate/core`](../../core/docs/introduction.md). It keeps a slice of a `signalState` or
`signalStore` in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-ngrx-signals @ngrx/signals @homeostate/crdt-yjs yjs
```

`@angular/core` 21 and `@ngrx/signals` 21 are peer dependencies.

## Usage

`injector` is required: it owns the state watcher, so the engine can reconnect outside an
injection context. Capture it with `inject(Injector)`:

```ts
import { DestroyRef, inject, Injector } from "@angular/core";
import { patchState, signalState } from "@ngrx/signals";
import { createSyncEngine } from "@homeostate/core";
import { createNgrxSignalsAdapter } from "@homeostate/store-ngrx-signals";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import * as Y from "yjs";

const state = signalState({ shared: { count: 0 }, panelOpen: false });
const doc = new Y.Doc();
const adapter = createNgrxSignalsAdapter(state, {
  select: (state) => state.shared,
  replace: (shared) => patchState(state, { shared }),
  injector: inject(Injector),
});
const engine = createSyncEngine(createYjsBackend(doc, "counter"), adapter);
engine.connect();

patchState(state, ({ shared }) => ({ shared: { count: shared.count + 1 } }));

inject(DestroyRef).onDestroy(() => {
  engine.disconnect();
  doc.destroy();
});
```

Attach a Yjs provider to `doc` for replication, and destroy it on teardown too.

- `select` must return the same object until the slice changes, so update the slice
  immutably and never build a new object in `select`.
- `replace` must replace the slice completely, including removing absent keys. `patchState`
  shallow-merges, so keep synced data under one key, such as `shared`, and replace that key.
- For a protected `signalStore`, create the adapter inside `withHooks` or `withMethods`, or
  pass a public replacement method as `replace`.

Disconnecting the engine, or destroying the injector, removes the watcher. Disconnecting the
engine and destroying the document stay yours to do.

See the [Angular playground](../../../apps/playground-angular/README.md) for a complete demo.
