---
description: Zustand adapter and middleware for @homeostate/core
label: Introduction
---

# @homeostate/store-zustand

> [!WARNING]
> **Early release.** The API is still being designed and may change in any `0.x` minor
> version.

[Zustand](https://github.com/pmndrs/zustand) store adapter and middleware for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a Zustand store in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](../../crdt-yjs/docs/introduction.md),
[`@homeostate/crdt-loro`](../../crdt-loro/docs/introduction.md), or
[`@homeostate/crdt-automerge`](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-zustand zustand @homeostate/crdt-yjs yjs
```

`zustand` 4.5 or 5 is a peer dependency.

## Usage

Wrap the state creator with the `homeostate` middleware. The store connects as soon as it
is created, and the engine is exposed as `store.homeostate`:

```ts
import * as Y from "yjs";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

const doc = new Y.Doc();
const useCounter = create<CounterState>()(
  homeostate(createYjsBackend(doc, "shared"), (set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  })),
);

useCounter.homeostate.disconnect(); // stop syncing
```

The optional third argument is the engine's `SyncEngineConfig` (`filter`, `seed`).

To sync a store you already have, create the engine yourself with `createZustandAdapter`:

```ts
import { createSyncEngine } from "@homeostate/core";
import { createZustandAdapter } from "@homeostate/store-zustand";

const engine = createSyncEngine(
  createYjsBackend(doc, "shared"),
  createZustandAdapter(useCounter),
);
engine.connect();
```

Actions and other functions in the state are skipped by the default sync filter, so only
data is synced. Remote changes replace the state with `setState(state, true)`.
