# @homeostate/store-tanstack

[TanStack Store](https://tanstack.com/store) adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a TanStack `Store` in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-yjs),
[`@homeostate/crdt-loro`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-loro), or
[`@homeostate/crdt-automerge`](https://github.com/mixedrays/homeostate/tree/main/packages/crdt-automerge).

## Install

```bash
npm install @homeostate/core @homeostate/store-tanstack @tanstack/store @homeostate/crdt-yjs yjs
```

`@tanstack/store` 0.11 is a peer dependency.

## Usage

```ts
import * as Y from "yjs";
import { createStore } from "@tanstack/store";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createTanStackStoreAdapter } from "@homeostate/store-tanstack";

const store = createStore({ count: 0 });

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createTanStackStoreAdapter(store),
);
engine.connect();

store.setState((state) => ({ ...state, count: state.count + 1 }));
```

Stores created with or without an actions factory both work; only the state is synced.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
