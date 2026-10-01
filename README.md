# Homeostate

Keep any state manager in sync with any CRDT. Pick a store adapter and a CRDT backend:

```bash
npm install @homeostate/core @homeostate/store-zustand @homeostate/crdt-yjs
```

Docs: [homeostate.pages.dev](https://homeostate.pages.dev/docs/getting-started).

## Packages

| Package                             | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `@homeostate/core`                  | Sync engine, persistence, and the contracts below |
| `@homeostate/crdt-yjs`              | Yjs backend                                       |
| `@homeostate/crdt-loro`             | Loro backend                                      |
| `@homeostate/crdt-automerge`        | Automerge backend                                 |
| `@homeostate/store-zustand`         | Zustand adapter and middleware                    |
| `@homeostate/store-redux`           | Redux adapter                                     |
| `@homeostate/store-mobx`            | MobX adapter                                      |
| `@homeostate/store-mobx-state-tree` | MobX-State-Tree adapter                           |
| `@homeostate/store-jotai`           | Jotai adapter                                     |
| `@homeostate/store-valtio`          | Valtio adapter                                    |
| `@homeostate/store-tanstack`        | TanStack Store adapter                            |
| `@homeostate/store-ngrx-signals`    | NgRx Signals adapter                              |
| `@homeostate/persist-indexeddb`     | IndexedDB storage for `createPersistence`         |
| `@homeostate/persist-local-storage` | localStorage storage for `createPersistence`      |
| `@homeostate/tool-devtools`         | React panel to inspect and edit synced state      |

`crdt-*` packages implement `CrdtBackend`, `store-*` packages implement `StoreAdapter`, and
`persist-*` packages implement `PersistenceAdapter`. Each lives in `packages/<name>`.

## Apps

Private, under `apps/`:

- [`playground`](apps/playground/README.md) and `playground-{react,angular,vue,svelte}`: demos that share Yjs rooms
- [`websocket-server-yjs`](apps/websocket-server-yjs/README.md): y-websocket server for the playgrounds
- [`benchmark-crdt`](apps/benchmark-crdt/README.md), [`benchmark-store`](apps/benchmark-store/README.md), [`benchmark-ui`](apps/benchmark-ui/README.md): backend and render benchmarks, and their viewer
- [`docs`](apps/docs/README.md): docs site, built from `packages/*/docs` and `apps/docs/content`

## Scripts

```bash
pnpm install
pnpm playground   # every playground + WebSocket server; pnpm playground:<react|angular|vue|svelte> for one
pnpm dev          # every app's dev server
pnpm build
pnpm typecheck
pnpm lint
pnpm format       # CI runs pnpm format:check
pnpm test
pnpm bench:crdt   # pnpm bench:crdt -- --help for options
pnpm bench:store
pnpm bench:ui     # viewer for saved benchmark reports
pnpm docs         # docs site on http://localhost:5190
```

Run one package's script with `pnpm --filter <name> <script>`.

Releasing: see [RELEASE.md](RELEASE.md).

## Third-party notices

`core` and the `crdt-*` packages include code derived from
[zustand-middleware-yjs](https://github.com/joebobmiles/zustand-middleware-yjs) (MIT, © 2021
Joseph R Miles); see each package's `THIRD_PARTY_NOTICES.md`.
