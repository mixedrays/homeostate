---
description: Valtio adapter for @homeostate/core
label: Introduction
---

# @homeostate/store-valtio

[Valtio](https://valtio.dev) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a Valtio proxy in sync with a CRDT backend such as
[`@homeostate/crdt-yjs`](../../crdt-yjs/docs/introduction.md),
[`@homeostate/crdt-loro`](../../crdt-loro/docs/introduction.md), or
[`@homeostate/crdt-automerge`](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-valtio valtio @homeostate/crdt-yjs yjs
```

`valtio` 2 is a peer dependency.

## Usage

```ts
import * as Y from "yjs";
import { proxy } from "valtio";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createValtioAdapter } from "@homeostate/store-valtio";

const state = proxy({
  todos: [] as { id: string; title: string; done: boolean }[],
  filter: "all",
});

const engine = createSyncEngine(
  createYjsBackend(new Y.Doc(), "shared"),
  createValtioAdapter(state),
);
engine.connect();

state.todos.push({ id: crypto.randomUUID(), title: "Write docs", done: false });
```

Mutate the proxy as usual; every change is sent to the backend. Remote changes mutate only
the paths that differ, so unchanged subtrees keep their proxy identity and components
reading them through `useSnapshot` do not re-render.
