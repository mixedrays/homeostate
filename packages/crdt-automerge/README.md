# @homeostate/crdt-automerge

[Automerge](https://automerge.org) backend for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It maps the synced state onto one key of an Automerge document (objects become maps, arrays
lists, strings text), one Automerge change per write.

## Install

```bash
npm install @homeostate/core @homeostate/crdt-automerge @automerge/automerge
```

`@automerge/automerge` 3.x is a peer dependency. It ships WebAssembly; for bundler setup see
[Automerge's documentation](https://automerge.org/docs/).

## Usage

Automerge documents are immutable, so `createAutomergeHandle` holds the current one for the
backend and your replication code to share:

```ts
import * as A from "@automerge/automerge";
import { createSyncEngine } from "@homeostate/core";
import {
  createAutomergeBackend,
  createAutomergeHandle,
} from "@homeostate/crdt-automerge";

const handle = createAutomergeHandle(A.init());
const engine = createSyncEngine(
  createAutomergeBackend(handle, "shared"),
  adapter,
);
engine.connect();

// Replication is yours to wire:
handle.subscribe(({ doc, local }) => {
  if (local) send(A.getLastLocalChange(doc));
});
onMessage((change) => handle.update((doc) => A.applyChanges(doc, [change])[0]));
```

`handle.doc()` returns the current document, `handle.change(fn)` applies a local change, and
`handle.update(fn)` replaces the document with the result of any Automerge call. See the
[documentation](https://homeostate.pages.dev/docs/crdt-automerge/introduction) for details.

To persist the document, pass `createAutomergePersistable(handle)` to `createPersistence`;
see the [persistence guide](https://homeostate.pages.dev/docs/persistence).

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
