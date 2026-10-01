---
description: Sync Angular state with Homeostate using NgRx SignalStore or SignalState and synchronous watchState notifications.
order: 1
---

# NgRx Signals

Homeostate adapter for Angular 21 and NgRx Signals 21. Supports both `signalState`
and `signalStore` through a selected, replaceable plain-JSON state object.

```bash
npm install @homeostate/core @homeostate/store-ngrx-signals @homeostate/crdt-yjs @ngrx/signals yjs
```

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

Attach a Yjs transport provider to `doc` for replication between clients. Destroy
that provider during teardown too. The Angular playground contains a complete example.

`select` must return the same object reference until that slice changes; avoid
constructing a new object on every read. Update the selected object immutably.
`replace` must replace it completely, including deleting absent keys. NgRx's
`patchState(store, next)` shallow-merges, so directly patching a root state is not
a general replacement implementation. Keeping synced data under `shared` lets
`patchState(store, { shared: next })` satisfy the contract while other fields stay local.

The adapter uses synchronous `watchState` notifications to let Homeostate suppress
remote echoes. It skips the initial watcher notification and unchanged slices.
Disconnecting destroys the watcher; reconnecting works outside an injection
context via the captured injector. Destroying the owning injector also removes
the watcher; the caller still owns engine/backend cleanup.

For a protected SignalStore, create the adapter inside `withHooks`/`withMethods`,
or supply a public replacement method through `replace`.

See the [Angular playground](../../../apps/playground-angular/README.md) for the complete demo.
