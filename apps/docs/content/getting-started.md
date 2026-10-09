---
description: Build a React counter with Zustand and Yjs, run a local sync server, and see changes arrive in a second browser tab.
order: 1
---

# Getting started

Build a shared counter with React, Zustand and Yjs. By the end, clicking **Increment** in
one browser tab updates the other, and a newly opened tab adopts the room's current count.

You need Node.js 24 or newer, npm, and two terminals. Homeostate keeps your store in sync
with a CRDT document; a Yjs WebSocket provider carries that document's updates between peers.

## Create an app

Create a React + TypeScript app with [Vite](https://vite.dev/guide/). If prompted to install
and start it immediately, choose No, then run the remaining commands:

```bash
npm create vite@latest homeostate-counter -- --template react-ts
cd homeostate-counter
npm install
```

If you already have a React + TypeScript app, start with the install step below.

## Install

Install the sync engine, the Zustand adapter, the Yjs backend and their dependencies:

```bash install
npm install @homeostate/core @homeostate/store-zustand zustand@^5 @homeostate/crdt-yjs yjs@^13.6.0 y-websocket@^2.1.0
```

This guide uses `y-websocket` 2.x, which includes the local server command used below.

> [!NOTE]
> Homeostate packages are in `0.x`, so breaking changes may come in minor versions.

## Start the sync server

In the first terminal, from the app's directory, run:

```bash
npx y-websocket
```

Leave it running. It listens on `ws://localhost:1234` by default. The provider and server
are supplied by [y-websocket](https://github.com/yjs/y-websocket/tree/v2.1.0); Homeostate
handles the synchronization between the store and the document.

## Sync a store

Create `src/counter.ts`:

```ts title="src/counter.ts"
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

export const doc = new Y.Doc();

export const useCounter = create<CounterState>()(
  homeostate(
    createYjsBackend(doc, "shared"),
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { seed: "never" },
  ),
);

export const provider = new WebsocketProvider(
  "ws://localhost:1234",
  "homeostate-counter",
  doc,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    useCounter.homeostate.disconnect();
    provider.destroy();
    doc.destroy();
  });
}
```

The `homeostate` middleware connects the store to `doc.getMap("shared")`. The default
filter excludes the `increment` function, so only `count` is shared.

`seed: "never"` leaves a new document empty until the first local edit. That prevents a
joining tab from writing its initial zero over a count already in the room. The UI below
waits for the provider's initial sync before allowing edits.

Every tab uses the same server URL, room name (`homeostate-counter`) and map name (`shared`).
The final block cleans up the old store and connection when Vite reloads this module during
editing.

## Add the counter UI

Replace `src/App.tsx` with the following. Keep Vite's generated `src/main.tsx`; it already
renders `App`.

```tsx title="src/App.tsx"
import { useEffect, useState } from "react";
import { provider, useCounter } from "./counter";

export default function App() {
  const count = useCounter((state) => state.count);
  const increment = useCounter((state) => state.increment);
  const [synced, setSynced] = useState(provider.synced);

  useEffect(() => {
    provider.on("sync", setSynced);
    setSynced(provider.synced);
    return () => provider.off("sync", setSynced);
  }, []);

  return (
    <main>
      <h1>Shared counter</h1>
      <p role="status">
        {synced ? "Connected" : "Connecting to the sync server…"}
      </p>
      <p>Count: {count}</p>
      <button disabled={!synced} onClick={increment}>
        Increment
      </button>
    </main>
  );
}
```

## Try two tabs

In a second terminal, from the same app directory, start Vite:

```bash
npm run dev
```

1. Open the URL Vite prints, usually `http://localhost:5173`, in two browser tabs.
2. Wait until both show **Connected**. Click **Increment** in the first tab: both counts
   should become `1`.
3. Click **Increment** in the second tab: both counts should become `2`.
4. Refresh one tab, or open a third: it should show `2` after connecting, without resetting
   the other tabs.

Use a different browser or a private window as an additional check: Yjs also exchanges
updates directly between tabs in the same browser, so a cross-browser check verifies the
WebSocket server is carrying the changes.

If the button stays disabled, check that the sync server is still running on port `1234`.
If Vite chooses a different port, open the exact same Vite URL in both tabs. If port `1234`
is occupied, stop the other local server before starting this one.

> [!NOTE]
> This example shares a numeric value. Simultaneous clicks can resolve to the same count;
> it is not an additive CRDT counter that preserves every concurrent increment.

## Use another store or backend

Homeostate has three pieces. Swap the Zustand adapter or Yjs backend for the packages your
app uses:

1. [`@homeostate/core`](../../../packages/core/docs/introduction.md), the sync engine.
2. One store adapter for your state manager:
   [Zustand](../../../packages/store-zustand/docs/introduction.md),
   [Redux](../../../packages/store-redux/docs/introduction.md),
   [MobX](../../../packages/store-mobx/docs/introduction.md),
   [MobX-State-Tree](../../../packages/store-mobx-state-tree/docs/introduction.md),
   [Jotai](../../../packages/store-jotai/docs/introduction.md),
   [Valtio](../../../packages/store-valtio/docs/introduction.md),
   [TanStack Store](../../../packages/store-tanstack/docs/introduction.md) or
   [NgRx Signals](../../../packages/store-ngrx-signals/docs/introduction.md).
3. One CRDT backend for your replication library:
   [Yjs](../../../packages/crdt-yjs/docs/introduction.md),
   [Loro](../../../packages/crdt-loro/docs/introduction.md) or
   [Automerge](../../../packages/crdt-automerge/docs/introduction.md).

Every other store adapter uses `createSyncEngine` from core instead of the Zustand
middleware; each package's introduction shows its setup.

## Next steps

- Try the [React playground](https://github.com/mixedrays/homeostate/tree/main/apps/playground-react)
  for todo and text-editing examples. From a checkout of this repository, run `pnpm install`
  and `pnpm playground:react` to start it with its sync server.
- [Concepts](./concepts.md) explains the engine and how `connect()` reconciles a store with
  an existing document.
- [`@homeostate/core`](../../../packages/core/docs/introduction.md) covers the engine options.
- [Persistence](./persistence.md) keeps the document in the browser so it survives reloads
  even when the server and all other peers are unavailable. This counter has no persistence.
