# @homeostate/playground-angular

Private Angular 21 playground with an NgRx SignalStore todo demo, built with Angular CLI.

```bash
pnpm playground:angular   # http://localhost:4200, with the WebSocket server
```

Open http://localhost:4200/todo/ngrx-signals next to a React demo at
http://localhost:5181/todo and edit either. **Go offline** disconnects a tab so you can edit
both sides and watch them merge on reconnect.

`public/config.json` sets the WebSocket server and the link back to the landing page; see the
[playground README](../playground/README.md) for configuration and deployment.

## Structure

- `src/todo.store.ts`: the SignalStore, its methods and derived values, sync and cleanup.
- `src/home.component.*`: the landing page, listing the apps in `src/demos.ts`.
- `src/todo-stores.component.*`: the store selector.
- `src/todo.component.*`: todo controls, connection status and state inspector.

The store keeps synced data under a `shared` key that the adapter's `select` unwraps, so the
CRDT schema matches the other playgrounds.
