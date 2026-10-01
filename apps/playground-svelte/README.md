# @homeostate/playground-svelte

Private Svelte 5 + Vite playground with a TanStack Store todo demo.

```bash
pnpm playground:svelte   # http://localhost:5183, with the WebSocket server
```

Open http://localhost:5183/todo/tanstack-store next to a React demo at
http://localhost:5181/todo and edit either. **Go offline** disconnects a tab so you can edit
both sides and watch them merge on reconnect. See the
[playground README](../playground/README.md) for configuration and deployment.

## Structure

- `src/todo.store.ts`: the TanStack Store, its actions and derived atoms, sync and teardown.
- `src/router.svelte.ts`: a small History API router.
- `src/HomePage.svelte`: the landing page, listing the apps in `src/demos.ts`.
- `src/TodoStoresPage.svelte`: the store selector.
- `src/TodoPage.svelte`: todo controls, connection status and state inspector.

There is no Svelte-specific adapter: it uses `@homeostate/store-tanstack`, and components read
the store through `useSelector` from `@tanstack/svelte-store`.

Prettier has no Svelte plugin in this workspace, so `pnpm format` skips `.svelte` files.
