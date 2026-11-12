---
description: Test that homeostate peers converge, on a simulated network with latency, drops, reordering and partitions
label: Introduction
---

# @homeostate/tool-simulator

Test that peers synced by [`@homeostate/core`](../../core/docs/introduction.md) converge. The
simulator runs several peers, each a store, a backend and a sync engine, on a simulated
network on virtual time. You control its latency, drop and reorder its messages, and cut peers
off from each other, then check that every peer ends up with the same state.

## Install

```bash install
npm install -D @homeostate/tool-simulator
```

It needs no particular test runner: a failed check throws an error that says where peers
differ.

## Usage

Create a network, add a peer per store, change the stores, then let the network deliver
everything and check convergence:

```ts title="todos.test.ts"
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

A peer is what `createSyncEngine` takes, an `adapter` and a `backend`, plus `doc`: the same
document as binary updates, from the CRDT package's `createYjsPersistable`,
`createLoroPersistable` or `createAutomergePersistable`. That is what the network carries, so
the simulator works with any backend that has one.

| `addPeer` option | Default    | Description                                                                                |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `adapter`        |            | The store                                                                                  |
| `backend`        |            | The backend the engine syncs the store through                                             |
| `doc`            |            | The backend's document as binary updates                                                   |
| `config`         |            | Passed to `createSyncEngine`; its `filter`, `keys` and `omit` also decide what is compared |
| `name`           | `peer-<n>` | Names the peer in errors                                                                   |
| `connect`        | `true`     | Whether to connect the engine as the peer joins                                            |

`addPeer` returns the peer, with its `engine` and `syncedState()`, the store's synced keys as
JSON. `network.peers` lists every peer in the order they joined.

## The network

| `createNetwork` option | Default | Description                                                               |
| ---------------------- | ------- | ------------------------------------------------------------------------- |
| `seed`                 | random  | Seed of every random choice, so a run can be replayed                     |
| `latency`              | `0`     | Virtual milliseconds a message takes: a number, or `[min, max]`           |
| `dropRate`             | `0`     | Probability that an update is lost                                        |
| `reorder`              | `false` | Whether messages between two peers may overtake each other                |
| `maxDeliveries`        | 100 000 | Deliveries one `settle()` makes before it gives up on a network in a loop |
| `checkLostKeys`        | `true`  | Whether `advance` and `settle` reject when a peer loses a synced key      |

Every change to a peer's document goes to each peer it is linked to, after the latency. Without
`reorder`, messages between two peers arrive in the order they were sent, as over a WebSocket.

Linking two peers makes them exchange their whole documents, as providers do when they
reconnect. That exchange is never dropped, so once peers are linked again, whatever was lost on
the way reaches them.

The updates the exchange leads to are not so safe. A store that writes in answer to remote
changes, such as a subscriber that keeps a derived key in synced state or a model that fills
defaults, writes new updates as the exchanged documents arrive, and with a `dropRate` those can
be dropped too. Nothing links the peers again, so they stay lost, where a provider would resync.
Before checking convergence, repeat `heal()` and `settle()` until `stats().dropped` stops
growing. Cap the rounds, as [`runRandomized`](#randomized-runs) does, since a store that writes
on every exchange never stops:

```ts
for (let round = 0; round < 10; round++) {
  const dropped = network.stats().dropped;
  network.heal();
  await network.settle();
  if (network.stats().dropped === dropped) break;
}
network.expectConverged();
```

| Method                 | Does                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `disconnect(a, b)`     | Cuts the link between two peers; messages on their way between them are lost     |
| `connect(a, b)`        | Links two peers, which exchange their documents                                  |
| `isolate(peer)`        | Cuts a peer off from every other, as going offline does                          |
| `partition(...groups)` | Links peers only within their group; a peer in no group is linked to none        |
| `heal()`               | Links every pair of peers and has each exchange documents, as if all reconnected |
| `linked(a, b)`         | Whether two peers are linked                                                     |
| `advance(ms)`          | Delivers the messages due within the next `ms` of virtual time                   |
| `settle()`             | Delivers every message on its way, and those they lead to, until none are left   |
| `now()`                | Virtual time, in milliseconds                                                    |
| `stats()`              | Messages `sent`, `delivered`, `dropped`, lost to a `cut` link, and `inFlight`    |
| `destroy()`            | Disconnects every engine and drops what is on its way                            |

`advance` lets changes cross each other on their way: with a latency of 10, a change made after
`advance(5)` is made before the earlier one has arrived. `advance` and `settle` return promises:
between deliveries they let the event loop run, so stores that notify asynchronously catch up.
They keep working if the test fakes timers later.

### Lost keys

Convergence is checked only when you ask, so a peer that drops a synced key for a while and
gets it back once a late update arrives would still converge. App code that reads the key in
between would not cope. So `advance` and `settle` also check, after each delivery and when they
return, that no peer lost a synced top-level key:

- A peer **holds** a key once a check sees it both in the store's synced state, what
  `peer.syncedState()` returns, and in the peer's document.
- A key is **deleted** for the rest of the network's life once it leaves any peer's store or
  document outside a delivery: in your test's own changes, between `advance` and `settle` calls.
- A peer **lost** a key when it held the key, its store and document both lack it now, and no
  peer deleted it.

`advance` or `settle` then rejects with a `LostKeyError` that has the `seed`, the `peer`'s name,
the `key`, and the virtual time `at` which it was found:

```text
peer-1 lost the synced key title at 412.5 ms (seed 11), on an update from peer-0: its store and document both lack it, and no peer deleted it.
```

A key a peer's `filter` rejects for the value another peer wrote leaves the store but stays in
the document, and a key that a store has but its document never held is not held, so neither is
reported. A peer whose engine is disconnected keeps its store as it is, so it loses nothing. A
store that notifies asynchronously, or an engine with `schedule`, can apply a change after its
delivery's check: a loss is then found at a later check, or missed if your test changes the
store first, but never reported wrongly.

A top-level key deleted during a delivery, such as by a store subscriber or a timer, is
reported as lost when the delete reaches the other peers. Pass `checkLostKeys: false` for such
tests.

## Convergence

`expectConverged()` throws a `ConvergenceError` unless the peers agree. It compares, as JSON:

- each peer's document, as its backend reads it, with the first peer's;
- each peer's store, the keys its engine's `filter` syncs, with the first peer's;
- each connected peer's store with its own document.

The error lists one line per difference, with the first path where the two differ:

```text
2 peers did not converge (seed 9):
- peer-1's document differs from peer-0's at title: "" vs "hello"
- peer-1's store differs from peer-0's at title: "" vs "hello"
```

`differences()` returns the same lines, empty once the peers have converged. When messages are
still on their way, the error says so: `settle()` first. When updates were dropped since the
last `heal()`, it says how many: `heal()` and `settle()` again, as in [the network](#the-network).

## Randomized runs

`runRandomized` tests many interleavings at once. Each step changes a random peer's store with
a random action, or cuts or restores a random link, then lets a random amount of virtual time
pass. At the end it heals the network, settles it and checks convergence. Throughout, the
network checks that no peer [loses a synced key](#lost-keys).

With a `dropRate`, the updates stores write in answer to the healing exchange can be dropped
too, as [the network](#the-network) explains. So the run heals and settles again until a round
drops nothing, at most 10 rounds, as a provider that resyncs would. Only that final phase
repeats: the steps make the same random choices, so a seed replays the same steps.

```ts title="todos.random.test.ts"
import { runRandomized } from "@homeostate/tool-simulator";

await runRandomized({
  peers: 3,
  steps: 200,
  createPeer: (index) => {
    const doc = new Y.Doc();
    doc.clientID = index + 1;
    const store = createStore(() => ({ todos: [], filter: "all" }));
    return {
      adapter: createZustandAdapter(store),
      backend: createYjsBackend(doc, "shared"),
      doc: createYjsPersistable(doc),
    };
  },
  network: { latency: [0, 20], reorder: true, dropRate: 0.1 },
});
```

| Option           | Default        | Description                                                           |
| ---------------- | -------------- | --------------------------------------------------------------------- |
| `createPeer`     |                | Makes peer `index`, as `addPeer` takes it                             |
| `seed`           | random         | Seed of the run                                                       |
| `peers`          | `3`            | Number of peers                                                       |
| `steps`          | `100`          | Number of steps                                                       |
| `actions`        | `[randomEdit]` | What a step may do to a peer's store: `(peer, random) => void`        |
| `network`        |                | `latency`, `dropRate`, `reorder`, `maxDeliveries` and `checkLostKeys` |
| `linkChangeRate` | `0.1`          | Chance that a step cuts or restores a link instead                    |
| `stepInterval`   | `10`           | Most virtual milliseconds between two steps                           |

A run that fails rejects with an error that names its seed and step, followed by the
differences:

```text
Randomized run failed after 200 steps; pass `seed: 1187460231` to replay it.
3 peers did not converge (seed 1187460231):
- peer-2's store differs from its document at todos[1].title: "mil" vs "milk"
```

or by the key a peer lost, with the step in which it happened:

```text
Randomized run failed at step 67 of 150; pass `seed: 11` to replay it.
peer-1 lost the synced key title at 412.5 ms (seed 11), on an update from peer-0: its store and document both lack it, and no peer deleted it.
```

When peers do not converge and the tenth round of healing still dropped updates, the error ends
with a line that says so. A store probably writes in answer to every exchange, so the updates
never stop:

```text
Updates were still being dropped after 10 rounds of heal() and settle(): does a store write in answer to every exchange?
```

Pass that `seed` to replay the run. For runs that replay exactly, give each document a fixed
ID, as above: Yjs, Loro and Automerge otherwise pick random ones, which decide how concurrent
changes merge. `doc.setPeerId(index + 1)` does it for Loro, and `A.init({ actor })` for
Automerge.

`randomEdit`, the default action, changes one of the store's synced keys through
`adapter.setState`, at a random depth: it adds or removes an array item or an object key, edits
a string, emoji included, or replaces a value. It never adds or removes the store's own keys,
and leaves the others, actions included, as they are. It suits stores that take any JSON under
their keys; for stores with a schema, such as MobX-State-Tree models, pass actions that call
the store's own API, picking values with `random`:

```ts
const addTodo: RandomAction = (peer, random) =>
  todoStores[peer.index].addTodo(`todo ${random.int(100)}`);
```

An action may delete a store's top-level keys: it runs between deliveries, so the delete does
not count as a [lost key](#lost-keys) when it reaches the other peers.

`createRandom(seed)` makes the same kind of seeded source: `next()`, `int(max)`, `chance(p)`
and `pick(items)`.

## Peers that join

By default `addPeer` connects the engine right away, before the network has delivered the
other peers' state, as an app does that connects without waiting for its provider. The engine
then seeds the store's keys into an empty document, and each such key competes with the room's
when the documents merge: the CRDT keeps one of the two, and what was written under the other
is lost. Convergence holds, so `expectConverged()` passes, but the room's state may be gone.

To model an app that waits for its provider to sync, add the peer with `connect: false` and
connect its engine once the room's state has arrived:

```ts
const peer = network.addPeer({ ...setup, connect: false });
await network.settle();
peer.engine.connect();
```

Or model [`ready`](../../core/docs/sync-engine.md#waiting-for-the-room), which connects the engine
as the peer joins and holds back its writes, by passing a promise in its config:

```ts
network.addPeer({ ...setup, config: { ready } });
await network.settle();
resolveReady();
await ready;
await network.settle();
```

Until then `expectConverged()` throws if the store holds a key its document lacks: the peer has
not written it, so it has not converged.
