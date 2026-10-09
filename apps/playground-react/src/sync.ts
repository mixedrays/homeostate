import {
  connectSharedDoc as connect,
  TODO_ROOM,
} from "@homeostate/playground/shared";

export {
  createInitialTodoState,
  EDITOR_ROOM,
  isTodoTitle,
  SYNC_MAP_NAME,
  TODO_ROOM,
} from "@homeostate/playground/shared";

export const SYNC_SERVER_URL =
  import.meta.env.VITE_SYNC_SERVER_URL ?? "ws://localhost:9999";

export function connectSharedDoc(room = TODO_ROOM) {
  return connect(SYNC_SERVER_URL, room);
}
