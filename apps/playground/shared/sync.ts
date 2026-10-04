import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  createPersistence,
  type Persistence,
  type TextPolicy,
} from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createLocalStorageAdapter } from "@homeostate/persist-local-storage";
import { createNetworkLink } from "@homeostate/tool-devtools/network";
import type { TodoState } from "./todo.js";

/** Bump when changing the initial state or how its CRDT seed is encoded. */
const TODO_SEED_VERSION = 2;
/** All todo adapters share one versioned room, separate from older seed histories. */
export const TODO_ROOM = `homeostate-todos-v${TODO_SEED_VERSION}`;
/** The room of the collaborative editor, kept apart so its presence stays out of the todos. */
export const EDITOR_ROOM = "homeostate-editor";
export const SYNC_MAP_NAME = "shared-ydoc";

/**
 * Todo titles are Y.Texts, so two tabs renaming one todo keep both edits. Every other string,
 * such as an id, the filter or the search term, is a plain value, and concurrent writes keep
 * one of them. Every backend on the todo room must pass it; changing it requires a
 * TODO_SEED_VERSION bump.
 */
export const isTodoTitle: TextPolicy = (path) =>
  path.length === 3 && path[0] === "todos" && path[2] === "title";

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
    createYjsBackend(seed, SYNC_MAP_NAME, { text: isTodoTitle }).write(
      createInitialTodoState(),
    );
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
function persistRoom(ydoc: Y.Doc, room: string): Persistence | undefined {
  // Not `typeof localStorage`: Node 25 defines one that warns when read.
  if (typeof window === "undefined" || !window.localStorage) return undefined;
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
 * provider. The provider syncs a document of its own, which a network link keeps in step with
 * the room's, so the devtools can slow down or cut the connection. Destroying the document
 * also stops persisting it and the link.
 */
export function connectSharedDoc(serverUrl: string, room = TODO_ROOM) {
  const ydoc = new Y.Doc();
  // Seed before the provider can receive updates (including same-browser broadcasts).
  if (room === TODO_ROOM) seedTodos(ydoc);
  const persistence = persistRoom(ydoc, room);
  const wire = new Y.Doc();
  const network = createNetworkLink(
    createYjsPersistable(ydoc),
    createYjsPersistable(wire),
  );
  ydoc.on("destroy", () => {
    network.destroy();
    wire.destroy();
  });
  const wsProvider = new WebsocketProvider(serverUrl, room, wire);
  return { ydoc, wsProvider, persistence, network };
}
