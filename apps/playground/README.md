# @homeostate/playground

Private Vite page that links to every framework's playground, plus the
[code those playgrounds share](#shared-code). Each playground is a
separate app in `apps/playground-<framework>` with its own landing page and demos; they
all join the same Yjs rooms through the shared WebSocket server.

| Playground                                 | Dev URL               | Production path |
| ------------------------------------------ | --------------------- | --------------- |
| This landing page                          | http://localhost:5180 | `/`             |
| [React](../playground-react/README.md)     | http://localhost:5181 | `/react/`       |
| [Angular](../playground-angular/README.md) | http://localhost:4200 | `/angular/`     |
| [Vue](../playground-vue/README.md)         | http://localhost:5182 | `/vue/`         |

## Run

From the repository root:

```bash
pnpm playground          # this page, every playground and the WebSocket server
pnpm playground:react    # React and the WebSocket server only
pnpm playground:angular  # Angular and the WebSocket server only
pnpm playground:vue      # Vue and the WebSocket server only
```

## Configuration

The links default to the dev URLs above in development and to the production paths in a
build. Override one with `VITE_PLAYGROUND_REACT_URL`, `VITE_PLAYGROUND_ANGULAR_URL` or
`VITE_PLAYGROUND_VUE_URL` when
that playground is hosted elsewhere.

## Shared code

`shared/` holds the framework-independent helpers every playground imports from
`@homeostate/playground/shared`: todo types, filtering/counting, room names, and identical
Yjs document initialization.

`connectSharedDoc(serverUrl, room?)` creates a seeded document and its WebSocket
provider. The caller owns both and must destroy the provider and document on teardown.
The sync server URL is supplied by each app's configuration.

All todo demos use `homeostate-todos-v1` and the `shared-ydoc` map. The seed's CRDT
history must remain identical in every playground. If defaults or their encoding change in
[`shared/sync.ts`](shared/sync.ts), bump `TODO_SEED_VERSION` there. The editor room remains
separate.

## Adding a playground

1. Create `apps/playground-<framework>` with a `dev` script on a fixed port, a landing page
   listing its demos, a link back to this page, and a dependency on
   `@homeostate/playground` for the shared code. `pnpm playground` picks it up through
   the `./apps/playground*` filter.
2. Add it to [`src/playgrounds.ts`](src/playgrounds.ts).
3. Add a `playground:<framework>` script to the root `package.json`.
