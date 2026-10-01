---
description: Zustand adapter and middleware for @homeostate/core
label: Introduction
---

# @homeostate/store-zustand

[Zustand](https://github.com/pmndrs/zustand) store adapter and middleware for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a Zustand store in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

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

Only data is synced: the default filter skips actions and other functions in the state, and
remote changes leave them in place.
