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

A mutation reaches the backend after a microtask, together with every other mutation made before
it, so one array method such as `splice`, `unshift`, `sort` or `reverse` is written once, as one
change. A remote change that arrives meanwhile is merged with the waiting mutations, and
`engine.disconnect()` writes them first. Code and tests that read the backend right after a
mutation wait for the write first:

```ts
state.todos.splice(0, 1);
await Promise.resolve(); // the backend now holds the removal
```

Pass `onError` to `createSyncEngine`: a write that fails after the microtask has no caller to
throw to, so without `onError` it is an uncaught error. An adapter you write around this one must
keep its `batchWrites` flag, or every intermediate state is written again.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
