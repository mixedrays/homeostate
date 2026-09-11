# @homeostate/crdt-automerge

> **Draft / placeholder release.** `0.0.0` reserves the name while the API is still
> being designed. Nothing here is stable — do not depend on it yet.

[Automerge](https://automerge.org) backend for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It maps the synced state onto one key of an Automerge document (nested objects become
maps, arrays lists, strings text) and writes fine-grained operations derived from
`getChanges`, one Automerge change per `write`.

## Install

```bash
npm install @homeostate/core @homeostate/crdt-automerge @automerge/automerge
```

`@automerge/automerge` 3.x is a peer dependency.

## Usage

```ts
import * as A from '@automerge/automerge';
import { createSyncEngine } from '@homeostate/core';
import { createAutomergeBackend, createAutomergeHandle } from '@homeostate/crdt-automerge';

const handle = createAutomergeHandle(A.init());
const engine = createSyncEngine(createAutomergeBackend(handle, 'shared'), adapter);
engine.connect();
```

Automerge documents are immutable values: every change returns a new document and leaves
the old one behind. `createAutomergeHandle` holds the current document so the backend and
your replication code share it:

- `handle.doc()` returns the current document.
- `handle.change(fn)` applies a local change through `A.change`.
- `handle.update((doc) => ...)` replaces the document with the result of `A.merge`,
  `A.applyChanges`, `A.loadIncremental`, `A.receiveSyncMessage`, or any other Automerge call.
- `handle.subscribe(({ doc, local }) => ...)` fires whenever the heads change; `local` is
  true for `change` and false for `update`.

The synced state lives in `handle.doc().shared`; a middle-of-array delete, a toggle, or a
keystroke each produce one small change. Replication is yours to wire, for example:

```ts
handle.subscribe(({ doc, local }) => {
  if (local) send(A.getLastLocalChange(doc));
});
onMessage((change) => handle.update((doc) => A.applyChanges(doc, [change])[0]));
```

The engine hears about every change that did not come through its own `write`, imports
and local edits alike.

`read()` returns plain JSON. Automerge keeps every object that the last change did not
touch, so the backend caches copies per source object and a read after a toggle copies only
the containers on the path to the toggled item. Snapshots are shared between reads; treat
them as immutable.

`undefined` is not JSON and Automerge rejects it, so the backend drops object entries whose
value is `undefined` and stores `undefined` array items as `null`, as `JSON.stringify` does.

`@automerge/automerge` ships WebAssembly. Node loads it directly; for bundlers see
[Automerge's documentation](https://automerge.org/docs/), or import
`@automerge/automerge/slim` and initialize the module yourself.

## License

MIT — see [LICENSE](./LICENSE). Includes code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs);
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
