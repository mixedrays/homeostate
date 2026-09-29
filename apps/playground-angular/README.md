# @homeostate/playground-angular

Standalone Angular 21 + NgRx SignalStore todo demo. It uses Angular CLI's application
builder and runs separately from the React/Vite playground. Both apps join the same
Yjs room through the same WebSocket server.

## Run

From the repository root (Node 24 recommended):

```bash
pnpm install
pnpm playground          # React :5173, Angular :4200, WebSocket :9999
pnpm playground:angular  # Angular :4200 and WebSocket :9999 only
```

Open http://localhost:4200 and a React todo demo at http://localhost:5173/todo.
Add, rename, complete, and delete todos in either app. Search and filter selection
are shared as well. Use **Go offline** to disconnect a tab, edit both sides, then
reconnect to merge the histories. Offline edits live in memory and do not survive
a page reload. **Inspect shared state** displays the current JSON snapshot.

## Configuration and deployment

`public/config.json` supplies `syncServerUrl` and `playgroundUrl`. It is copied to
the build output and loaded before Angular starts. Set the WebSocket URL (use
`wss://` on HTTPS) and the link back to the React playground for your deployment.
No Angular rebuild is needed to change these values in the output file.

```bash
pnpm --filter @homeostate/playground-angular build
pnpm --filter @homeostate/playground-angular typecheck
```

The static build is in `dist/browser`. To serve it under `/angular/` on the same
site as React, build with:

```bash
pnpm --filter @homeostate/playground-angular exec ng build --base-href /angular/
```

Serve the contents of `dist/browser` at `/angular/` and set the output `config.json`'s
`playgroundUrl` to `/todo`. Configure the React build's `VITE_ANGULAR_PLAYGROUND_URL`
if Angular is hosted elsewhere; its defaults are `http://localhost:4200` in development
and `/angular/` in production. This repository does not deploy the playgrounds automatically.

## Structure

- `src/todo.store.ts`: SignalStore methods, derived values, sync, and lifecycle cleanup.
- `src/app.component.*`: accessible todo controls, connection status, and state inspector.
- `@homeostate/store-ngrx-signals`: reusable adapter using synchronous `watchState`.
- `@homeostate/playground-shared`: common todo types, filtering, room, and CRDT seed.

The local `shared` wrapper in SignalStore is removed by the adapter's selector:
the CRDT schema is still `{ todos, searchTerm, filterStatus }`, matching React.
Always use the common initialization helper; independently inserting matching JSON
does not produce the identical CRDT history needed to preserve edits on joining.
