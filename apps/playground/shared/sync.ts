import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createPersistence, type Persistence } from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createLocalStorageAdapter } from "@homeostate/persist-local-storage";
import type { TodoState } from "./todo.js";

/** Bump when changing the initial state or how its CRDT seed is encoded. */
const TODO_SEED_VERSION = 1;
/** All todo adapters share one versioned room, separate from older seed histories. */
export const TODO_ROOM = `homeostate-todos-v${TODO_SEED_VERSION}`;
/** The room of the collaborative editor, kept apart so its presence stays out of the todos. */
export const EDITOR_ROOM = "homeostate-editor";
export const SYNC_MAP_NAME = "shared-ydoc";

/** Changes to these defaults require a TODO_SEED_VERSION bump. */
export const createInitialTodoState = (): TodoState => ({
  todos: [
    {
      id: "1",
      title: "Open a second tab, then click my text to edit me",
      completed: false,
    },
  ],
  searchTerm: "",
  filterStatus: "all",
});

/**
 * Identical CRDT history in every tab, including search and filter strings. Independently
 * inserting the same JSON would create competing root values and let a joining tab reset
 * the room. Client 0 authors only this seed; each live document keeps its own client ID.
 */
function seedTodos(doc: Y.Doc): void {
  const seed = new Y.Doc();
  try {
    seed.clientID = 0;
    createYjsBackend(seed, SYNC_MAP_NAME).write(createInitialTodoState());
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
  } finally {
    seed.destroy();
  }
}

/**
 * Keeps the room in this browser's localStorage, so it survives every tab closing and the sync
 * server restarting: the next tab to open restores it and hands it back to the server.
 * Engines may connect before it loads, because both rooms are seeded identically first:
 * the synced keys already exist, so `connect()` seeds nothing that could compete.
 */
function persistRoom(ydoc: Y.Doc, room: string): Persistence | null {
  // Not `typeof localStorage`: Node 25 defines one that warns when read.
  if (typeof window === "undefined" || !window.localStorage) return null;
  const persistence = createPersistence(
    createYjsPersistable(ydoc),
    createLocalStorageAdapter(),
    { key: room },
  );
  ydoc.on("destroy", () => void persistence.destroy());
  return persistence;
}

/**
 * Creates the room's document, restored from localStorage where available, and its WebSocket
 * provider. Destroying the document also stops persisting it.
 */
export function connectSharedDoc(serverUrl: string, room = TODO_ROOM) {
  const ydoc = new Y.Doc();
  // Seed before the provider can receive updates (including same-browser broadcasts).
  if (room === TODO_ROOM) seedTodos(ydoc);
  const persistence = persistRoom(ydoc, room);
  const wsProvider = new WebsocketProvider(serverUrl, room, ydoc);
  return { ydoc, wsProvider, persistence };
}
