---
description: TanStack Store adapter for @homeostate/core
label: Introduction
---

# @homeostate/store-tanstack

[TanStack Store](https://tanstack.com/store) adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a TanStack `Store` in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-tanstack @tanstack/store @homeostate/crdt-yjs yjs
```

`@tanstack/store` 0.11 is a peer dependency.

## Usage

```ts
import * as Y from "yjs";
import { createStore } from "@tanstack/store";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createTanStackStoreAdapter } from "@homeostate/store-tanstack";

const store = createStore({ count: 0 });

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createTanStackStoreAdapter(store),
);
engine.connect();

store.setState((state) => ({ ...state, count: state.count + 1 }));
```

Stores created with or without an actions factory both work; only the state is synced.
