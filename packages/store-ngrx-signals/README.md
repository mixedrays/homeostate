# @homeostate/store-ngrx-signals

[NgRx Signals](https://ngrx.io/guide/signals) adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a slice of a `signalState` or `signalStore` in sync with a CRDT backend such as
Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-ngrx-signals @homeostate/crdt-yjs @ngrx/signals yjs
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

inject(DestroyRef).onDestroy(() => {
  engine.disconnect();
  doc.destroy();
});
```

- `select` must return the same object until the slice changes; update it immutably.
- `replace` must replace the slice completely. `patchState` shallow-merges, so keep synced
  data under one key such as `shared` and replace that key.
- For a protected `signalStore`, create the adapter inside `withHooks` or `withMethods`.

See the [documentation](https://homeostate.pages.dev/docs/store-ngrx-signals/introduction)
for details.

## License

MIT — see [LICENSE](./LICENSE).
