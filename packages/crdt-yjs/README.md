# @homeostate/crdt-yjs

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

To persist the document, pass `createYjsPersistable(doc)` to `createPersistence`; see the
[persistence guide](https://homeostate.pages.dev/docs/persistence).

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
