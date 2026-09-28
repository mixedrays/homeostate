import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import type { TodoState } from "./types/todo";

const envServerUrl: string | undefined = import.meta.env.VITE_SYNC_SERVER_URL;

export const SYNC_SERVER_URL = envServerUrl ?? "ws://localhost:9999";
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

export function connectSharedDoc(room = TODO_ROOM) {
  const ydoc = new Y.Doc();
  // Seed before the provider can receive updates (including same-browser broadcasts).
  if (room === TODO_ROOM) seedTodos(ydoc);
  const wsProvider = new WebsocketProvider(SYNC_SERVER_URL, room, ydoc);
  return { ydoc, wsProvider };
}
