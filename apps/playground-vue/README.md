# @homeostate/playground-vue

Private Vue 3 + Vite playground with a TanStack Store todo demo.

```bash
pnpm playground:vue   # http://localhost:5182, with the WebSocket server
```

Open http://localhost:5182/todo/tanstack-store next to a React demo at
http://localhost:5181/todo and edit either. **Go offline** disconnects a tab so you can edit
both sides and watch them merge on reconnect. See the
[playground README](../playground/README.md) for configuration and deployment.

## Structure

- `src/todo.store.ts`: the TanStack Store, its actions and derived atoms, sync and teardown.
- `src/HomePage.vue`: the landing page, listing the apps in `src/demos.ts`.
- `src/TodoStoresPage.vue`: the store selector.
- `src/TodoPage.vue`: todo controls, connection status, and the devtools mounted with `mountDevtools`.

There is no Vue-specific adapter: it uses `@homeostate/store-tanstack`, and components read
the store through `useSelector` from `@tanstack/vue-store`.
