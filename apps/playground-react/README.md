# @homeostate/playground-react

Private React + Vite app with its own landing page, seven store-adapter todo demos and a collaborative text editor. Every
demo page mounts `@homeostate/tool-devtools`: **Inspect state** in the header, or the round
button in the bottom-right corner, opens a panel to inspect and edit that demo's store, its
Yjs document and a log of its changes.

`pnpm playground:react` from the repository root starts this app on :5181 with the shared
WebSocket server on :9999; `pnpm playground` also starts the
[landing page](../playground/README.md) and every other playground. The landing page's
**All playgrounds** link uses `VITE_PLAYGROUNDS_URL` (defaults to `http://localhost:5180` in
development and `/` in production). To serve the build under a sub-path, pass it as the
base: `pnpm --filter @homeostate/playground-react exec vite build --base /react/`.

## Todo initialization

All seven React todo demos and the separate [Angular](../playground-angular/README.md) and [Vue](../playground-vue/README.md) playgrounds join `homeostate-todos-v1`. Before connecting, each tab applies the same
CRDT seed for `todos`, `searchTerm`, and `filterStatus`, so opening another tab preserves the
room's edits and tabs can start editing offline before their first synchronization.

The seed and its encoding must stay identical within a room version. When changing the
defaults in [shared sync initialization](../playground/shared/sync.ts) or their CRDT encoding, bump `TODO_SEED_VERSION`
there as well. This intentionally starts a fresh demo room; existing room data is not
automatically migrated. The former `my-roomname` room is left untouched, and older clients
remain in their old room. The editor uses its own room and initialization.
