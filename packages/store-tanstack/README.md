# @homeostate/store-tanstack

[![npm](https://img.shields.io/npm/v/@homeostate/store-tanstack?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-tanstack)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-tanstack?externals=@homeostate/core,@tanstack/store&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-tanstack&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22%40tanstack%2Fstore%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-tanstack?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-tanstack)
[![license](https://img.shields.io/npm/l/@homeostate/store-tanstack?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-tanstack/LICENSE)

[TanStack Store](https://tanstack.com/store) adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a TanStack `Store` in sync with a CRDT backend such as Yjs, Loro or Automerge.

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
