---
description: Keep a Zustand, Redux, MobX or other store in sync with an Automerge document, writing fine-grained operations as one change per write.
label: Introduction
---

# @homeostate/crdt-automerge

[Automerge](https://automerge.org) backend for
[`@homeostate/core`](../../core/docs/introduction.md). It maps the synced state onto one key of
an Automerge document (objects become maps, arrays lists, and strings `ImmutableString`s or,
where you choose, text) and writes fine-grained operations as one Automerge change per write,
so a middle-of-array delete, a toggle or a keystroke each produce one small change.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-automerge @automerge/automerge
```

`@automerge/automerge` 3.x is a peer dependency. It ships WebAssembly, which Node loads
directly; for bundler setup see [Automerge's documentation](https://automerge.org/docs/).

## Usage

Automerge documents are immutable values: every change returns a new document. A handle
holds the current one, so the backend and your replication code share it:

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

// Replication is yours to wire, for example:
handle.subscribe(({ doc, local }) => {
  if (local) send(A.getLastLocalChange(doc));
});
onMessage((change) => handle.update((doc) => A.applyChanges(doc, [change])[0]));
```

- `handle.doc()` returns the current document; the synced state is `handle.doc().shared`.
- `handle.change(fn)` applies a local change through `A.change`.
- `handle.update((doc) => ...)` replaces the document with the result of `A.merge`,
  `A.applyChanges`, `A.loadIncremental`, `A.receiveSyncMessage` or any other Automerge call.
- `handle.subscribe(({ doc, local }) => ...)` fires whenever the heads change; `local` is
  true for `change` and false for `update`.

The backend uses only `doc`, `change` and `subscribe`, typed `AutomergeDocSource`, so any object
with those three can hold the document in place of a handle.

The engine picks up every change that did not come through its own write, imports and local
edits alike.

`undefined` and functions are not JSON, so the backend leaves out object entries holding
either and stores such array items as `null`, as `JSON.stringify` does.

Snapshots from `read()` copy only what changed since the last read and are shared between
reads, so treat them as immutable. A missing synced key reads as `{}`. If a peer stores
anything but a map there, such as a string or `null`, `read()` throws a `TypeError` naming
what the key holds, which the sync engine reports; a `write` replaces it with a map.

## With automerge-repo

[automerge-repo](https://automerge.org/docs/repositories/) keeps documents in a `Repo`, which
stores them through a storage adapter and syncs them through network adapters. Pass one of its
`DocHandle`s instead of a handle, and the `Repo` stores and syncs what the engine writes:

```ts
import { Repo } from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { createSyncEngine } from "@homeostate/core";
import { createAutomergeBackend } from "@homeostate/crdt-automerge";

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new BrowserWebSocketClientAdapter("wss://sync.example.com")],
});
// `url` is the document's AutomergeUrl, such as `repo.create().url` where it was created.
const docHandle = await repo.find(url);
const engine = createSyncEngine(
  createAutomergeBackend(docHandle, "shared"),
  storeAdapter,
);
engine.connect();
```

`repo.find` resolves once the document is ready, loaded from storage or a peer, so `connect()`
sees the stored state instead of seeding the store's defaults over it. As with a handle, the
engine picks up every change that did not come through its own write: changes loaded from
storage, received from peers, or made through `docHandle.change`.

The `Repo` and the backend must share one copy of `@automerge/automerge`, so check that your
package manager installs only one.

## Strings and text

Strings are `ImmutableString` values by default, so two peers changing an id, a status or a
timestamp at once keep one of the two values. Pass `text` to store chosen strings as Automerge
text, whose concurrent edits merge character by character:

```ts
const backend = createAutomergeBackend(handle, "shared", {
  text: (path) => path[0] === "todos" && path[2] === "title",
});
```

`text` receives the path from the synced key, such as `["todos", 0, "title"]`. `read()`
returns plain strings either way, `ImmutableString`s included. Give every backend writing to
the document the same policy. A string held as the other kind, such as text written by an
earlier release, reads as usual and is stored as the configured kind when it next changes. See
[Strings and text](/docs/concepts#strings-and-text).

## Persistence

Pass `createAutomergePersistable(handle)` to `createPersistence`. It stores `A.save` of the
document plus the changes of each update since. Restoring a stored update that is not
Automerge data, such as damaged bytes or another library's update under a reused key, throws,
even though `A.loadIncremental` skips such bytes once the document holds changes, so
`createPersistence` reports it and keeps the stored log. With
[automerge-repo](#with-automerge-repo), the `Repo`'s storage adapter stores the document
instead. See the [persistence guide](/docs/persistence).
