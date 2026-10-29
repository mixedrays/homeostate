# @homeostate/crdt-yjs

[![npm](https://img.shields.io/npm/v/@homeostate/crdt-yjs?color=2563eb)](https://www.npmjs.com/package/@homeostate/crdt-yjs)
[![minzipped size](https://img.shields.io/bundlejs/size/%40homeostate%2Fcrdt-yjs?externals=@homeostate/core,yjs&color=2563eb&label=minzipped%20size)](https://bundlejs.com/?q=%40homeostate%2Fcrdt-yjs&config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22%40homeostate%2Fcore%22%2C%22yjs%22%5D%7D%7D)
[![downloads](https://img.shields.io/npm/dm/@homeostate/crdt-yjs?color=2563eb)](https://www.npmjs.com/package/@homeostate/crdt-yjs)
[![license](https://img.shields.io/npm/l/@homeostate/crdt-yjs?color=2563eb)](https://github.com/mixedrays/homeostate/blob/main/packages/crdt-yjs/LICENSE)

[Yjs](https://github.com/yjs/yjs) backend for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It maps the synced state onto a `Y.Map` (objects become `Y.Map`, arrays `Y.Array`, and strings
plain values or, where you choose, `Y.Text`), so a toggle or a keystroke produces one small
update.

## Install

```bash
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const doc = new Y.Doc();
const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap("shared")`. Attach any Yjs provider to `doc` for
replication.

`undefined` and functions are not JSON, so the backend leaves out object entries holding
either and stores such array items as `null`, as `JSON.stringify` does.

Strings are plain values, so concurrent writes keep one of them. Pass `text` to store chosen
strings as `Y.Text`, whose concurrent edits merge character by character:

```ts
createYjsBackend(doc, "shared", {
  text: (path) => path[0] === "todos" && path[2] === "title",
});
```

The backend also exposes `map`, the synced `Y.Map`, and `origin`, which tags its writes. To
undo the store's own edits, track that origin with `Y.UndoManager`, created after `connect()`.
An undo reaches the store as a remote change:

```ts
const backend = createYjsBackend(doc, "shared");
createSyncEngine(backend, adapter).connect();
const undoManager = new Y.UndoManager(backend.map, {
  trackedOrigins: new Set([backend.origin]),
});
```

To sync into a map you already have, such as one nested in another map, pass it instead of a
document and a name: `createYjsBackend(map, options)`. It must already be part of a document.
If a peer later replaces it, or a map holding it, the backend calls `onRemoved` (by default it
logs with `console.error`): no peer sees its writes from then on, so connect a new engine over
the map that replaced it.

To persist the document, pass `createYjsPersistable(doc)` to `createPersistence`; see the
[persistence guide](https://homeostate.pages.dev/docs/persistence).

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
