# @homeostate/store-jotai

[Jotai](https://jotai.org) store adapter for
[`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core).
It keeps a writable atom in sync with a CRDT backend such as Yjs, Loro or Automerge.

## Install

```bash
npm install @homeostate/core @homeostate/store-jotai jotai @homeostate/crdt-yjs yjs
```

`jotai` 2 or 3 is a peer dependency.

## Usage

The adapter syncs one writable atom that holds the whole synced state and accepts a full
replacement:

```ts
import * as Y from "yjs";
import { atom, createStore } from "jotai";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createJotaiAdapter } from "@homeostate/store-jotai";

const counterAtom = atom({ count: 0 });
const store = createStore();

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createJotaiAdapter(counterAtom, store),
);
engine.connect();
```

The store argument defaults to Jotai's default store; pass the one you give `<Provider>` if
you use one. To sync several atoms, pass a derived writable atom that reads them and fans a
replacement out to each; see the
[documentation](https://homeostate.pages.dev/docs/store-jotai/introduction) for an example.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
