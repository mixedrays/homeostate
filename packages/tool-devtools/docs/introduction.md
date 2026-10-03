---
description: Floating React devtools to inspect and edit the state a homeostate sync engine keeps in sync
label: Introduction
---

# @homeostate/tool-devtools

React devtools for [`@homeostate/core`](../../core/docs/introduction.md). A floating button
opens a panel docked to the edge of the page, where you can inspect and edit a store's
state, compare it with the synced backend document, follow a log of every change, and
connect or disconnect the sync engine.

## Install

```bash install
npm install -D @homeostate/tool-devtools
```

`react` and `react-dom` 18 or 19 are peer dependencies. The package brings its own styles,
so the app needs no Tailwind or shadcn setup.

## Usage

Render `HomeostateDevtools` anywhere in the app and hand it the pieces of each sync setup:
the store `adapter`, and optionally the `backend` and `engine`.

```tsx
import * as Y from "yjs";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import { HomeostateDevtools } from "@homeostate/tool-devtools";

const adapter = createZustandAdapter(useTodoStore);
const backend = createYjsBackend(new Y.Doc(), "shared");
const engine = createSyncEngine(backend, adapter);
engine.connect();

export function App() {
  return (
    <>
      <TodoList />
      <HomeostateDevtools
        sources={[{ name: "Todos", adapter, backend, engine }]}
      />
    </>
  );
}
```

Pass several sources to inspect several stores; the panel then shows a switcher. With the
Zustand `homeostate` middleware, create an adapter for the devtools with
`createZustandAdapter(store)` and pass `store.homeostate` as the engine.

| Prop             | Default          | Description                                                           |
| ---------------- | ---------------- | --------------------------------------------------------------------- |
| `sources`        |                  | `{ name, adapter, backend?, engine?, filter?, persistence? }` each    |
| `buttonPosition` | `"bottom-right"` | Viewport corner of the button: `bottom-left`, `top-right`, `top-left` |
| `panelPosition`  | `"right"`        | Edge the panel docks to: `left`, `bottom`, `top`                      |
| `initialIsOpen`  | `false`          | Whether the panel starts open, until it is opened or closed once      |
| `open`           |                  | Controls whether the panel is open, to open it from your own UI       |
| `onOpenChange`   |                  | Called with the new state when the panel is opened or closed          |
| `theme`          | `"system"`       | `light`, `dark`, or `system` to follow `prefers-color-scheme`         |
| `logLimit`       | `200`            | Log entries kept per source                                           |

To open the panel from your own UI, such as an "Inspect state" button, control it with
`open` and `onOpenChange`; the devtools then leave remembering it to you.

Pass the engine's `filter` in the source too, if it has one, so the keys it keeps out of sync
are marked local. If the document is [persisted](/docs/persistence), pass what
`createPersistence` returned as `persistence` to see and manage what is stored.

## The panel

The panel is not modal: the page stays usable while it is open, so you can use the app and
watch its state change. Drag its inner edge, or focus it and use the arrow keys, to resize
it. Whether it is open, its size and its tab are remembered in `localStorage`.

- **State** shows the store as a tree or as JSON. Click a value to edit it, click a boolean to
  toggle it, edit an object or array as JSON, or delete a key or item. The JSON view edits
  the whole state. Each top-level key is marked with how it relates to the backend. Values in
  synced keys that are not plain JSON, such as a `Date`, a `Map`, a class instance or `NaN`,
  are listed in a warning and marked in the tree: the engine does not sync them as they are,
  and the tree shows them as JSON would, a `Date` as a string and a `Map` as `{}`.
- **Sync** lists every key as `synced`, `diverged` (the backend holds another value, as it
  may while disconnected), `pending` (not in the backend yet), `local` (kept out by the
  filter) or `backend only`, and shows the backend document read-only.
- **Log** records each change to the store with its diff, marked `local`, `remote` (a peer's
  change applied through the backend) or `devtools`. Any entry can be restored. Recording
  can be paused and the log cleared. **Export** saves the log as a JSON file and **Import**
  replaces the log with one, so a log recorded elsewhere, such as one attached to a bug
  report, can be stepped through and its states restored here.
- **Storage** shows how many updates the stored document holds and their size, read again as
  the state changes. **Compact** merges them into one snapshot now, as every `compactAfter`
  updates do. **Clear** removes the stored document and stops storing it until the page
  reloads; the live document and its peers keep their state, and other tabs that store the
  same key may write it again.
- The header shows whether the engine is connected, with a switch to disconnect and
  reconnect it.

## Edits go through the store

Every edit, including a restore, calls the source's `adapter.setState`, so the engine writes
it to the backend like any other local change and every peer receives it. Keys that are not
JSON, such as a Zustand store's actions, are left as they are, and unchanged subtrees keep
their identity, so the store sees a change only where you made one. The backend is never
written directly.

> [!WARNING]
> Restoring a log entry is not local time travel: it replaces the shared state for every
> peer in the room.

While the engine is disconnected, edits stay in the local store. Reconnecting adopts the
backend's values, as [`connect()`](/docs/concepts#connecting) always does,
so edits made in the meantime to keys the backend holds are dropped.

## Styles

The devtools render into a shadow root on `document.body` with their own stylesheet, so the
page's CSS and the panel's never mix. The only rules added to the page itself are Tailwind's
`@property` registrations, which browsers ignore inside a shadow root.

## Production builds

The component renders in every build. To leave it out of production bundles, load it only in
development and render it inside a `Suspense` boundary:

```tsx
import { lazy } from "react";

const HomeostateDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@homeostate/tool-devtools").then((module) => ({
        default: module.HomeostateDevtools,
      })),
    )
  : () => null;
```
