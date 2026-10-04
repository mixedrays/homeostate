# @homeostate/tool-simulator

Test that peers synced by [`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core)
converge. It runs several peers, each a store, a backend and a sync engine, on a simulated
network with latency, dropped and reordered messages and partitions, on virtual time, and
checks that every peer ends up with the same state.

## Install

```bash
npm install -D @homeostate/tool-simulator
```

It works with any test runner: a failed check throws an error that says where peers differ.

## Usage

```ts
import * as Y from "yjs";
import { createStore } from "zustand/vanilla";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import { createNetwork } from "@homeostate/tool-simulator";

const network = createNetwork({ latency: [5, 50], seed: 42 });
const stores = [0, 1, 2].map(() => {
  const doc = new Y.Doc();
  const store = createStore(() => ({ todos: [] }));
  network.addPeer({
    adapter: createZustandAdapter(store),
    backend: createYjsBackend(doc, "shared"),
    doc: createYjsPersistable(doc),
  });
  return store;
});
await network.settle();

const [alice, bob] = network.peers;
network.disconnect(alice, bob);
stores[0].setState({ todos: [{ title: "milk" }] });
stores[1].setState({ todos: [{ title: "bread" }] });

network.heal();
await network.settle();
network.expectConverged();
```

Each peer's `doc` is its backend's document as binary updates, from the CRDT package's
`create*Persistable`: that is what the network carries. `settle()` delivers every message on
its way, and `expectConverged()` throws unless every peer's store and document agree.

`runRandomized` drives random edits, link cuts and reconnections across a fresh network, then
checks convergence and names the seed of a run that fails:

```ts
await runRandomized({
  createPeer: (index) => makePeer(index),
  network: { latency: [0, 20], reorder: true, dropRate: 0.1 },
});
```

See the [documentation](https://homeostate.pages.dev/docs/tool-simulator/introduction) for
every network control and what convergence compares.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
