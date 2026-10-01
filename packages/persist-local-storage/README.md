# @homeostate/persist-local-storage

localStorage storage for `createPersistence` from
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core). It keeps
a Yjs, Loro or Automerge document in the browser, so its state survives reloads, offline starts
and every peer leaving the room.

## Install

```bash
npm install @homeostate/core @homeostate/persist-local-storage @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createPersistence, createSyncEngine } from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createLocalStorageAdapter } from "@homeostate/persist-local-storage";

const doc = new Y.Doc();
const persistence = createPersistence(
  createYjsPersistable(doc),
  createLocalStorageAdapter(),
  { key: "todos" },
);

await persistence.whenLoaded;
createSyncEngine(createYjsBackend(doc, "shared"), adapter).connect();
```

Connect the engine after `whenLoaded`, so it adopts the restored state instead of seeding the
store's defaults over it. See the [persistence guide](https://homeostate.pages.dev/docs/persistence).

`createLocalStorageAdapter({ prefix, storage })` takes an optional key prefix (default
`"homeostate:"`) and storage, such as `sessionStorage`.

Browsers allow about 5 MB per origin, and each document is rewritten on every update. For
larger documents use
[`@homeostate/persist-indexeddb`](https://github.com/mixedrays/homeostate/tree/main/packages/persist-indexeddb).

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
