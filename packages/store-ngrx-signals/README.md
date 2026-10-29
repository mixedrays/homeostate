# @homeostate/store-ngrx-signals

[![npm](https://img.shields.io/npm/v/@homeostate/store-ngrx-signals?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-ngrx-signals)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-ngrx-signals?externals=@homeostate/core,@angular/core,@ngrx/signals&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-ngrx-signals&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22%40angular%2Fcore%22%2C%22%40ngrx%2Fsignals%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-ngrx-signals?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-ngrx-signals)
[![license](https://img.shields.io/npm/l/@homeostate/store-ngrx-signals?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-ngrx-signals/LICENSE)

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
