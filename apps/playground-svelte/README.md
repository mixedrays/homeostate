# @homeostate/playground-svelte

Private Svelte 5 + Vite playground with its own landing page and a TanStack Store todo demo.
It runs separately from the other playgrounds. Its todo demo joins the same Yjs room as
theirs through the same WebSocket server.

## Run

From the repository root:

```bash
pnpm install
pnpm playground         # landing page :5180, React :5181, Vue :5182, Svelte :5183, Angular :4200, WebSocket :9999
pnpm playground:svelte  # Svelte :5183 and WebSocket :9999 only
```

Open http://localhost:5183/todo/tanstack-store and a React todo demo at http://localhost:5181/todo.
Add, rename, complete, and delete todos in either app. Search and filter selection
are shared as well. Use **Go offline** to disconnect a tab, edit both sides, then
reconnect to merge the histories. Offline edits live in memory and do not survive
a page reload. **Inspect state** displays the current JSON snapshot.

## Configuration and deployment

`VITE_SYNC_SERVER_URL` sets the WebSocket server (defaults to `ws://localhost:9999`; use
`wss://` on HTTPS). The landing page's **All playgrounds** link uses `VITE_PLAYGROUNDS_URL`
(defaults to `http://localhost:5180` in development and `/` in production).

```bash
pnpm --filter @homeostate/playground-svelte build
pnpm --filter @homeostate/playground-svelte typecheck
```

To serve the build under `/svelte/` on the same site as the
[playgrounds landing page](../playground/README.md), pass the sub-path as the base:
`pnpm --filter @homeostate/playground-svelte exec vite build --base /svelte/`. Serve `dist` there
with unknown paths falling back to its `index.html`. Configure the landing page's
`VITE_PLAYGROUND_SVELTE_URL` if Svelte is hosted elsewhere; its defaults are
`http://localhost:5183` in development and `/svelte/` in production. This repository does not
deploy the playgrounds automatically.

## Structure

- `src/todo.store.ts`: the TanStack Store, its actions and derived atoms, sync, and teardown.
- `src/router.svelte.ts`: a small History API router; the app has three routes.
- `src/HomePage.svelte`: the landing page, listing the apps in `src/demos.ts`.
- `src/TodoStoresPage.svelte`: the todo app's store selector.
- `src/TodoPage.svelte`: accessible todo controls, connection status, and state inspector.
- `@tanstack/svelte-store`: `useSelector` exposes the store and its atoms as rune-backed values.
- `@homeostate/store-tanstack`: the same adapter the React and Vue TanStack Store demos use.
- `@homeostate/playground/shared`: common todo types, filtering, room, and CRDT seed.

There is no Svelte-specific homeostate adapter: the store is framework-independent and only
the components read it through Svelte. Always use the common initialization helper;
independently inserting matching JSON does not produce the identical CRDT history needed
to preserve edits on joining.

Prettier has no Svelte plugin in this workspace, so `pnpm format` skips the `.svelte` files.
