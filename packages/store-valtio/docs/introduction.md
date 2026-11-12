---
description: Keep a Valtio proxy in sync with a Yjs, Loro or Automerge document.
label: Introduction
---

# @homeostate/store-valtio

[Valtio](https://valtio.dev) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a Valtio proxy in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

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

## When mutations are written

Valtio notifies once per property set, so one array method notifies several times: `splice(0, 0,
x)` on a three-item list sets each item from the end down before it sets `x`. The adapter sets
[`batchNotifications`](../../core/docs/sync-engine.md#batched-writes), so the engine writes once
per microtask instead of once per set. One `splice`, `unshift`, `shift`, `sort` or `reverse` is
then one change, and a peer's concurrent edit stays on the item it targeted.

- A mutation reaches the backend after a microtask, with every mutation made before it in the
  same task.
- A remote change that arrives before that write is merged with the waiting mutations, so
  neither side's change is lost.
- `engine.disconnect()` writes waiting mutations before it disconnects.

Code and tests that read the backend right after a mutation wait for the write first:

```ts
state.todos.splice(0, 1);
await Promise.resolve(); // the backend now holds the removal
```
