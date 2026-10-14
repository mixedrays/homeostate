---
description: Floating devtools to inspect and edit the state a homeostate sync engine keeps in sync, as a React component or mounted from any framework
label: Introduction
---

# @homeostate/tool-devtools

Devtools for [`@homeostate/core`](../../core/docs/introduction.md), as a React component or
[mounted from any framework](#without-react). A floating button
opens a panel docked to the edge of the page, where you can inspect and edit a store's
state, compare it with the synced backend document, follow a log of every change, and
connect or disconnect the sync engine.

## Install

```bash install
npm install -D @homeostate/tool-devtools
```

The React component needs `react` and `react-dom` 18 or 19, which are optional peer
dependencies: other apps use [`mountDevtools`](#without-react), which brings its own. The
package brings its own styles, so the app needs no Tailwind or shadcn setup.

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

Pass several sources to inspect several stores; the panel's status bar then shows a switcher.
With the Zustand `homeostate` middleware, create an adapter for the devtools with
`createZustandAdapter(store)` and pass `store.homeostate` as the engine.

| Prop             | Default          | Description                                                           |
| ---------------- | ---------------- | --------------------------------------------------------------------- |
| `sources`        |                  | One per store: `{ name, adapter }` and the optional fields below      |
| `buttonPosition` | `"bottom-right"` | Viewport corner of the button: `bottom-left`, `top-right`, `top-left` |
| `panelPosition`  | `"right"`        | Edge the panel docks to: `left`, `bottom`, `top`                      |
| `initialIsOpen`  | `false`          | Whether the panel starts open, until it is opened or closed once      |
| `open`           |                  | Controls whether the panel is open, to open it from your own UI       |
| `onOpenChange`   |                  | Called with the new state when the panel is opened or closed          |
| `theme`          | `"system"`       | `light`, `dark`, or `system` to follow `prefers-color-scheme`         |
| `logLimit`       | `200`            | Log entries kept per source                                           |

`buttonPosition`, `panelPosition` and `theme` are where the devtools start: a corner, side or
theme picked in the panel's settings, behind the gear button, is remembered and applies instead.

To open the panel from your own UI, such as an "Inspect state" button, control it with
`open` and `onOpenChange`; the devtools then leave remembering it to you.

Pass the engine's `filter` in the source too, if it has one, so the keys it keeps out of sync
are marked local. If the document is [persisted](/docs/persistence), pass what
`createPersistence` returned as `persistence` to see and manage what is stored. Pass a
[network link](#network-conditions) as `network` to slow down or cut the connection.

## Without React

Apps on Angular, Vue, Svelte or no framework mount the same devtools with `mountDevtools`
from `@homeostate/tool-devtools/mount`. It takes the component's props as options and
returns right away with two methods:

- `update(options)` changes some options and keeps the others, for example `{ open: true }`
  from a button of your own.
- `unmount()` takes the devtools off the page. Call it when the store goes away:
  `onScopeDispose` in Vue, `onDestroy` in Svelte, `DestroyRef.onDestroy` in Angular.

The panel brings its own React, about 170 kB gzipped, in a chunk loaded in the background
once `mountDevtools` is called. The app needs no React, and its initial bundle grows by less
than a kilobyte.

```ts title="todo-page.ts"
import { mountDevtools } from "@homeostate/tool-devtools/mount";

const devtools = mountDevtools({
  sources: [{ name: "Todos", adapter, backend, engine }],
  open: false,
  onOpenChange: (open) => (inspecting = open),
});

// From the app's own "Inspect state" button:
devtools.update({ open: true });

// When the page that owns the store is left:
devtools.unmount();
```

## The panel

The panel is not modal: the page stays usable while it is open, so you can use the app and
watch its state change. Drag its inner edge, or focus it and use the arrow keys, to resize
it. In a narrow panel the tabs show only their icons. The gear button next to the close button
opens its settings: the side it docks to, the floating button's corner and the theme, light,
dark or the system's. Whether it is open, its size, its tab, its filters and its settings are
remembered in `localStorage`.

- **State** shows the store as a tree or as JSON. Click a value to edit it, click a boolean to
  toggle it, edit an object or array as JSON, or delete a key or item. The JSON view, with
  its syntax highlighted, edits the whole state. An untouched inline editor never writes
  on blur. If its value changes while you have a draft, the draft stays visible and cannot
  be saved until you choose **Load latest** or cancel and reopen the editor.
  Each top-level key is marked with how it
  relates to the backend. Values in synced keys that are not plain JSON, such as a `Date`, a
  `Map`, a class instance or `NaN`,
  are listed in a warning and marked in the tree: the engine does not sync them as they are,
  and the tree shows them as JSON would, a `Date` as a string and a `Map` as `{}`. Filter the
  tree by a path, such as `todos[0]`, or by a value: it shows what matches, with everything
  under it and the containers on the way to it open. The button beside the filter expands every
  container, then collapses them all.
  The tree is one tab stop, navigated from the keyboard: **↑**/**↓** move between rows,
  **Home**/**End** to the first and last, **→** opens a container or enters it, **←** closes it
  or goes to its parent, and typing a key's name jumps to it. **Enter** edits the value,
  toggles a boolean or edits a container as JSON, **Escape** cancels, and **Delete** or
  **Backspace** deletes the key or item. The backend document on the Sync tab navigates the same
  way, read-only.
- **Sync** lists every key as `synced`, `diverged` (the backend holds another value, as it
  may while disconnected), `pending` (not in the backend yet), `local` (kept out by the
  filter) or `backend only`, and shows the backend document read-only. Under a diverged key,
  each path that differs shows its value in the store and in the backend. The first ten
  differences show initially; **Show all** reveals the rest, and **Show first 10** collapses
  them again. Click a long string, object or array to inspect its full JSON value. Each
  path and each present value has a copy button; values are copied as JSON, including
  quotes around strings. Missing values are shown as `not set` and cannot be copied.
  If reading the backend fails, the panel reports the error and suspends key comparisons;
  the last successfully read document remains available, marked as such.
- **Log** records each change to the store with its diff, marked `local`, `remote` (a peer's
  change applied through the backend) or `devtools`. Open an entry to choose **Diff** for
  its recorded before/after values, **Snapshot** for a read-only tree or JSON view of its
  full state, or **Compare with current** for differences from that snapshot to the live
  store. The comparison stays live while recording is paused. Both diff views support the
  full-value inspection, copy actions and expandable results described under Sync.
  **Restore this state** writes the snapshot back to the store; the adjacent note names
  the source and explains whether the engine syncs that change to peers. Recording
  can be paused and the log cleared. Filter it by a path that a change touches, and by
  origin; the initial state always shows. **Export** saves the log as a JSON file and **Import**
  replaces the log with one, so a log recorded elsewhere, such as one attached to a bug
  report, can be stepped through and its states restored here.
- **Storage** shows how many updates the stored document holds and their size, read again as
  the state changes. **Compact** merges them into one snapshot now, as every `compactAfter`
  updates do. **Clear** removes the stored document and stops storing it until the page
  reloads; the live document and its peers keep their state, and other tabs that store the
  same key may write it again.
  Failed Compact or Clear operations remain visible after stats refreshes, until another
  operation is attempted.
- **Network** shows whether the engine is connected, with a switch to disconnect and
  reconnect it, and sets the [network conditions](#network-conditions) of the source's link:
  offline, latency, jitter and a flaky connection.
- The status bar at the bottom gives the source, or a switcher between several sources,
  the available space. Hover the name to read it in full. Long source names wrap in the
  switcher's list, which stays within the viewport in narrow panels. Beside the source,
  **Online** takes the network link offline and back, and **Connected** disconnects and
  reconnects the engine. Each shows only for a source with a link or an engine, and turns
  amber while its side is down.
- While the panel is closed, a dot on the floating button flags a disconnected engine, a link
  that is down or has conditions on, or diverged keys, and its tooltip names them.

## Network conditions

The Network tab slows down or cuts this tab's connection, to see what the app does when
changes cross on their way, when a peer lags behind, or when it goes offline and comes back.
It needs a link between the app's document and the network: `createNetworkLink` from
`@homeostate/tool-devtools/network`. The provider syncs a document of its own, and the link
relays every update between the two, at once until you set conditions.

```ts title="sync.ts"
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createNetworkLink } from "@homeostate/tool-devtools/network";

const doc = new Y.Doc();
const wire = new Y.Doc();
const network = createNetworkLink(
  createYjsPersistable(doc),
  createYjsPersistable(wire),
);
const provider = new WebsocketProvider(url, room, wire);
const backend = createYjsBackend(doc, "shared");

// In the devtools source: { name, adapter, backend, engine, network }
```

It carries each document's binary updates, so it works with any provider, and with Loro and
Automerge through their `create*Persistable`. The panel sets four conditions:

- **Offline** stops every update, both ways. Coming back online exchanges the whole
  documents, as a provider does on reconnecting, so both sides merge what the other missed.
  Unlike the engine switch above them, the store keeps syncing with this tab's document.
- **Latency** delays every update, both ways.
- **Jitter** adds up to that much more per update, at random. Updates still arrive in order,
  as over a WebSocket.
- **Flaky** drops the link for 1 to 3 seconds every 3 to 10 seconds, at random.

The tab also counts the updates on their way in each direction, and the tab and the status bar
say so while the link is down. Pass starting conditions as a third argument, such as `{ latency: 200 }`, or
change them from code with `network.setConditions`.

Presence, such as cursors, goes through the provider directly and is not delayed. The second
document doubles the memory the room takes, so set the link up in development only.

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

With `mountDevtools`, call it only in development, such as under `import.meta.env.DEV`:
the panel's chunk is then never loaded in production.
