# @homeostate/store-valtio

[![npm](https://img.shields.io/npm/v/@homeostate/store-valtio?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-valtio)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fstore-valtio?externals=@homeostate/core,valtio&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fstore-valtio&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22valtio%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/store-valtio?color=2563eb)](https://www.npmjs.com/package/@homeostate/store-valtio)
[![license](https://img.shields.io/npm/l/@homeostate/store-valtio?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/store-valtio/LICENSE)

[Valtio](https://valtio.dev) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a Valtio proxy in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-valtio valtio @homeostate/crdt-yjs yjs
```

`valtio` 2 is a peer dependency.

## Usage

```ts
import * as Y from "yjs";
import { proxy } from "valtio";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createValtioAdapter } from "@homeostate/store-valtio";

const state = proxy({
  todos: [] as { id: string; title: string; done: boolean }[],
  filter: "all",
});

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createValtioAdapter(state),
);
engine.connect();

state.todos.push({ id: crypto.randomUUID(), title: "Write docs", done: false });
```

Mutate the proxy as usual. Remote changes mutate only the paths that differ, so components
reading unchanged subtrees through `useSnapshot` do not re-render.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
