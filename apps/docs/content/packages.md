---
description: Every Homeostate package by group, from the sync engine to store adapters, CRDT backends, persistence, UI bindings and tools.
order: 4
---

# Packages

An app needs [`@homeostate/core`](../../../packages/core/docs/introduction.md), the store
adapter for its state manager and the CRDT backend for its document library;
[Getting started](./getting-started.md) installs core, the Zustand adapter and the Yjs backend.
Persistence, UI bindings and tools are optional. Each package is versioned and released on its
own.

## Core

- [`@homeostate/core`](../../../packages/core/docs/introduction.md): the sync engine between a
  store adapter and a CRDT backend, plus document persistence.

## CRDT backends

One per CRDT library. Each maps the synced state onto a document and writes fine-grained
operations, so a toggle or a keystroke produces one small update.

- [`@homeostate/crdt-yjs`](../../../packages/crdt-yjs/docs/introduction.md): Yjs backend. Syncs
  through any Yjs provider, such as y-websocket, and y-indexeddb can store it.
- [`@homeostate/crdt-loro`](../../../packages/crdt-loro/docs/introduction.md): Loro backend. You
  wire replication, and it has no storage package of its own. Ships WebAssembly.
- [`@homeostate/crdt-automerge`](../../../packages/crdt-automerge/docs/introduction.md):
  Automerge backend. automerge-repo can sync and store the document for you. Ships WebAssembly.

## Store adapters

One per state manager. Each keeps its store in sync with any CRDT backend.

- [`@homeostate/store-zustand`](../../../packages/store-zustand/docs/introduction.md): Zustand
  store adapter and middleware.
- [`@homeostate/store-redux`](../../../packages/store-redux/docs/introduction.md): Redux store
  enhancer and adapter.
- [`@homeostate/store-mobx`](../../../packages/store-mobx/docs/introduction.md): syncs the
  observable fields of a MobX store.
- [`@homeostate/store-mobx-state-tree`](../../../packages/store-mobx-state-tree/docs/introduction.md):
  syncs a MobX-State-Tree node.
- [`@homeostate/store-jotai`](../../../packages/store-jotai/docs/introduction.md): syncs a
  writable atom, or a record of atoms.
- [`@homeostate/store-valtio`](../../../packages/store-valtio/docs/introduction.md): syncs a
  Valtio proxy.
- [`@homeostate/store-tanstack`](../../../packages/store-tanstack/docs/introduction.md): syncs a
  TanStack `Store`.
- [`@homeostate/store-ngrx-signals`](../../../packages/store-ngrx-signals/docs/introduction.md):
  syncs a slice of an NgRx `signalState` or `signalStore`.

## Persistence

Storage for core's `createPersistence`, which keeps the document in the browser so its state
survives reloads, offline starts and every peer leaving the room. [Persistence](./persistence.md)
covers setup and [choosing storage](./persistence.md#choosing-storage).

- [`@homeostate/persist-indexeddb`](../../../packages/persist-indexeddb/docs/introduction.md):
  stores each update as an IndexedDB row, so appending stays cheap as the document grows. The
  default choice.
- [`@homeostate/persist-local-storage`](../../../packages/persist-local-storage/docs/introduction.md):
  keeps each document as one localStorage or sessionStorage entry, for small documents.

## UI frameworks

- [`@homeostate/react`](../../../packages/react/docs/introduction.md): a React hook for a sync
  engine's status. Core loads no React code.

## Tools

- [`@homeostate/tool-devtools`](../../../packages/tool-devtools/docs/introduction.md): a
  floating panel to inspect and edit a store's state, compare it with the synced document and
  follow a log of every change, as a React component or mounted from any framework.
- [`@homeostate/tool-simulator`](../../../packages/tool-simulator/docs/introduction.md): runs
  peers on a simulated network with latency, drops, reordering and partitions, and checks that
  they converge.
