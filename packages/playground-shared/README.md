# @homeostate/playground-shared

Private, framework-independent helpers shared by the React and Angular playgrounds:
todo types, filtering/counting, room names, and identical Yjs document initialization.

`connectSharedDoc(serverUrl, room?)` creates a seeded document and its WebSocket
provider. The caller owns both and must destroy the provider and document on teardown.
The sync server URL is supplied by each app's configuration.

All todo demos use `homeostate-todos-v1` and the `shared-ydoc` map. The seed's CRDT
history must remain identical in both apps. If defaults or their encoding change in
`src/sync.ts`, bump `TODO_SEED_VERSION` there. The editor room remains separate.
