---
description: Install the sync engine, a store adapter and a CRDT backend, then keep your first store in sync across peers.
order: 1
---

# Getting started

Homeostate keeps a store you already use in sync with a CRDT document, so every peer that
shares the document shares the state. You pick three packages:

1. [`@homeostate/core`](../../../packages/core/docs/introduction.md), the sync engine.
2. One store adapter for your state manager:
   [Zustand](../../../packages/store-zustand/docs/introduction.md),
   [Redux](../../../packages/store-redux/docs/introduction.md),
   [MobX](../../../packages/store-mobx/docs/introduction.md),
   [MobX-State-Tree](../../../packages/store-mobx-state-tree/docs/introduction.md),
   [Jotai](../../../packages/store-jotai/docs/introduction.md),
   [Valtio](../../../packages/store-valtio/docs/introduction.md) or
   [TanStack Store](../../../packages/store-tanstack/docs/introduction.md).
3. One CRDT backend for your replication library:
   [Yjs](../../../packages/crdt-yjs/docs/introduction.md),
   [Loro](../../../packages/crdt-loro/docs/introduction.md) or
   [Automerge](../../../packages/crdt-automerge/docs/introduction.md).

> [!NOTE]
> Every package is in `0.x`, so breaking changes, if any, come in minor versions. The caret
> range npm saves by default only takes patch releases in `0.x`.

## Install

This guide uses Zustand and Yjs:

```bash install
npm install @homeostate/core @homeostate/store-zustand zustand @homeostate/crdt-yjs yjs
```

## Sync a store

Wrap the state creator with the `homeostate` middleware and give it a backend. The store
connects as soon as it is created:

```ts title="counter.ts"
import * as Y from "yjs";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

export const doc = new Y.Doc();

export const useCounter = create<CounterState>()(
  homeostate(createYjsBackend(doc, "shared"), (set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  })),
);
```

`count` now lives in `doc.getMap("shared")` as well as in the store. `increment` is a
function, so the default filter keeps it out of the document.

Every other adapter works through `createSyncEngine` from core instead of a middleware; each
package's introduction shows its setup.

## Connect peers

The backend only holds the synced state. Replicating the document between peers is the CRDT
library's job, with any transport it supports. With Yjs, a
[y-websocket](https://github.com/yjs/y-websocket) provider is enough:

```ts
import { WebsocketProvider } from "y-websocket";
import { doc } from "./counter";

new WebsocketProvider("wss://sync.example.com", "counter-room", doc);
```

Open the app in two tabs and `increment` in one updates `count` in the other.

## Next steps

- [Concepts](./concepts.md) explains the two contracts the packages implement and how
  `connect()` reconciles a store with a document that already has state.
- [`@homeostate/core`](../../../packages/core/docs/introduction.md) covers the engine options.
