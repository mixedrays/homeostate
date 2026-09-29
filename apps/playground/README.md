# @homeostate/playground

Private Vite app with seven store-adapter todo demos and a collaborative text editor. Every
demo page mounts `@homeostate/tool-devtools`: **Inspect state** in the header, or the round
button in the bottom-right corner, opens a panel to inspect and edit that demo's store, its
Yjs document and a log of its changes.

## Todo initialization

All seven todo demos join `homeostate-todos-v1`. Before connecting, each tab applies the same
CRDT seed for `todos`, `searchTerm`, and `filterStatus`, so opening another tab preserves the
room's edits and tabs can start editing offline before their first synchronization.

The seed and its encoding must stay identical within a room version. When changing the
defaults in [src/sync.ts](src/sync.ts) or their CRDT encoding, bump `TODO_SEED_VERSION`
there as well. This intentionally starts a fresh demo room; existing room data is not
automatically migrated. The former `my-roomname` room is left untouched, and older clients
remain in their old room. The editor uses its own room and initialization.
