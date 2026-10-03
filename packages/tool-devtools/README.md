# @homeostate/tool-devtools

Devtools for [`@homeostate/core`](https://github.com/mixedrays/homeostate/tree/main/packages/core),
as a React component or mounted from any framework.
A floating button opens a panel where you can inspect and edit a store's state, compare it
with the synced backend document, follow a log of every change, and connect or disconnect
the engine.

## Install

```bash
npm install -D @homeostate/tool-devtools
```

The React component needs `react` and `react-dom` 18 or 19, which are optional peer
dependencies: other apps use [`mountDevtools`](#without-react), which brings its own. Styles
are bundled and isolated in a shadow root, so no CSS setup is needed.

## Usage

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

Pass several sources to inspect several stores. With the Zustand `homeostate` middleware, use
`createZustandAdapter(store)` as the adapter and `store.homeostate` as the engine. Pass what
`createPersistence` returned as `persistence` to see and compact the stored document on the
Storage tab.

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

> **Warning:** edits go through the store like any local change, so every peer in the room
> receives them. Restoring a log entry replaces the shared state for everyone.

## Without React

Apps on Angular, Vue, Svelte or no framework mount the same devtools with `mountDevtools`.
It takes the component's props as options and returns `update` and `unmount`. The panel
brings its own React and loads in the background, so the app needs no React and its initial
bundle grows by less than a kilobyte.

```ts
import { mountDevtools } from "@homeostate/tool-devtools/mount";

const devtools = mountDevtools({
  sources: [{ name: "Todos", adapter, backend, engine }],
});

devtools.update({ open: true }); // change some options
devtools.unmount(); // when the store goes away
```

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

With `mountDevtools`, call it only in development, such as under `import.meta.env.DEV`.

See the [documentation](https://homeostate.pages.dev/docs/tool-devtools/introduction) for
the panel's tabs and editing behavior.

## License

MIT — see [LICENSE](https://github.com/mixedrays/homeostate/blob/main/LICENSE).
