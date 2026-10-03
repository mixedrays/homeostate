# @homeostate/playground

Private landing page linking to every playground, plus the code they share. Each playground
is a separate app in `apps/playground-<name>`. The framework playgrounds' todo demos all join
the same Yjs room through the WebSocket server, so an edit in one shows up in the others; the
whiteboard keeps a room of its own.

| Playground                                       | Dev URL               | Production path |
| ------------------------------------------------ | --------------------- | --------------- |
| This landing page                                | http://localhost:5180 | `/`             |
| [React](../playground-react/README.md)           | http://localhost:5181 | `/react/`       |
| [Angular](../playground-angular/README.md)       | http://localhost:4200 | `/angular/`     |
| [Vue](../playground-vue/README.md)               | http://localhost:5182 | `/vue/`         |
| [Svelte](../playground-svelte/README.md)         | http://localhost:5183 | `/svelte/`      |
| [Whiteboard](../playground-whiteboard/README.md) | http://localhost:5184 | `/whiteboard/`  |

## Run

From the repository root:

```bash
pnpm playground          # this page, every playground and the WebSocket server on :9999
pnpm playground:react    # one playground and the WebSocket server; also :angular, :vue, :svelte, :whiteboard
```

The Angular, Vue and Svelte playgrounds load the devtools from their built bundle, which these
scripts build first. After changing the devtools, restart them or run `pnpm build:devtools`.

## Configuration and deployment

| Variable                     | Used by           | Default                                      |
| ---------------------------- | ----------------- | -------------------------------------------- |
| `VITE_PLAYGROUND_<NAME>_URL` | this page's links | the dev URL above, or the production path    |
| `VITE_SYNC_SERVER_URL`       | each playground   | `ws://localhost:9999`; use `wss://` on HTTPS |
| `VITE_PLAYGROUNDS_URL`       | each playground   | `http://localhost:5180`, or `/`              |

Angular reads the last two from `public/config.json` at startup instead (`syncServerUrl`,
`playgroundUrl`), so they can change without a rebuild.

To serve a playground under its production path, build with that base (`vite build --base
/vue/`, or `ng build --base-href /angular/`) and fall back unknown paths to its `index.html`.
The repository does not deploy the playgrounds.

## Shared code

`shared/` is imported as `@homeostate/playground/shared`: todo types, filtering, room names,
and `connectSharedDoc(serverUrl, room?)`, which creates a seeded Yjs document and its
WebSocket provider. The caller destroys both on teardown.

Where localStorage is available, `connectSharedDoc` also persists the room, so it survives
every tab closing and the server restarting. To start over from the seed, remove the
`homeostate:` entries from localStorage.

Every playground must seed through `connectSharedDoc`: matching JSON inserted independently
does not produce the same CRDT history, so joining tabs would lose edits. If the seed or its
encoding changes in [`shared/sync.ts`](shared/sync.ts), bump `TODO_SEED_VERSION` there; that
starts a fresh room.

## Adding a playground

1. Create `apps/playground-<framework>` with a `dev` script on a fixed port, a landing page
   listing its demos, a link back to this page, and a dependency on
   `@homeostate/playground` for the shared code. `pnpm playground` picks it up through
   the `./apps/playground*` filter.
2. Add it to [`src/playgrounds.ts`](src/playgrounds.ts).
3. Add a `playground:<framework>` script to the root `package.json`.
