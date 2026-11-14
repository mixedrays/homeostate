---
description: A React hook for the status of a sync engine, which re-renders a component when the engine connects, disconnects or fails.
label: Introduction
---

# @homeostate/react

React hook for the status of a sync engine from
[`@homeostate/core`](../../core/docs/introduction.md). Apps that don't use React don't need this
package, and core loads no React code.

## Install

```bash install
npm install @homeostate/react
```

It needs React 18 or 19, as a peer dependency. The project's CI runs React 19 only.

## Usage

```tsx
import { useSyncStatus } from "@homeostate/react";
import { useTodoStore } from "./store";

function Editor() {
  const { connected, failure } = useSyncStatus(useTodoStore.homeostate);

  return (
    <>
      {failure && <p role="alert">The last change did not sync.</p>}
      <textarea disabled={!connected} />
    </>
  );
}
```

`useSyncStatus(engine)` returns `getStatus()`, described in
[Sync status](../../core/docs/sync-engine.md#sync-status): `connected` and `failure`.
The component re-renders when the status changes, not on every local or remote change. A failure
that came before the component mounted shows too, as the engine keeps it.

## Which engine to pass

| Setup                                                                       | Pass                          |
| --------------------------------------------------------------------------- | ----------------------------- |
| [Zustand `homeostate`](../../store-zustand/docs/introduction.md) middleware | `store.homeostate`            |
| [Redux `homeostate`](../../store-redux/docs/introduction.md) enhancer       | `store.homeostate`            |
| [`syncMobxStore`](../../store-mobx/docs/introduction.md)                    | The engine it returns         |
| [`syncStateTree`](../../store-mobx-state-tree/docs/introduction.md)         | The engine it returns         |
| `createSyncEngine`                                                          | The engine it returns         |
| [Jotai `atomWithSync`](../../store-jotai/docs/introduction.md)              | Nothing: it exposes no engine |

For Jotai, build the engine yourself and pass that:
`createSyncEngine({ backend, adapter: createJotaiAdapter(atom, store) })`. A new engine prop is followed in the
same render.

## What the status does not tell

> [!WARNING]
> The status describes the engine and says nothing about the network. `connected` means the engine
> is done reconciling and subscribed to the store and the backend. It does not mean a peer is
> online or that the room has arrived.

So the hook sits next to a status built on the provider and does not replace it. With a
y-websocket provider, the engine reported `connected` with no `failure` whether the sync server
was unreachable, the provider had synced, `provider.disconnect()` had been called, or the server
had stopped after a sync. That comes from running y-websocket 2.1.0 and its server by hand, not
from an automated test, so it holds for that setup only. To wait for the room before connecting,
see [Waiting for the room](../../core/docs/sync-engine.md#waiting-for-the-room).

## Server rendering

On the server and during hydration the hook returns a disconnected status with no failure, whatever
the engine holds, so hydration matches what the server sent. The engine's status follows right after
hydration, so render anything that depends on it in a way that tolerates that first pass.
