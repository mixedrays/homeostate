import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { TodoState } from "./types/todo";

const envServerUrl: string | undefined = import.meta.env.VITE_SYNC_SERVER_URL;

export const SYNC_SERVER_URL = envServerUrl ?? "ws://localhost:9999";
/** The room every todo demo joins, whichever store it is built on. */
export const TODO_ROOM = "my-roomname";
/** The room of the collaborative editor, kept apart so its presence stays out of the todos. */
export const EDITOR_ROOM = "homeostate-editor";
export const SYNC_MAP_NAME = "shared-ydoc";

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

export function connectSharedDoc(room = TODO_ROOM) {
  const ydoc = new Y.Doc();
  const wsProvider = new WebsocketProvider(SYNC_SERVER_URL, room, ydoc);
  return { ydoc, wsProvider };
}
