import { connectSharedDoc } from "@homeostate/playground/shared";

export { SYNC_MAP_NAME } from "@homeostate/playground/shared";

export const SYNC_SERVER_URL: string =
  import.meta.env.VITE_SYNC_SERVER_URL ?? "ws://localhost:9999";

/** The landing page that links to every playground. */
export const PLAYGROUNDS_URL: string =
  import.meta.env.VITE_PLAYGROUNDS_URL ??
  (import.meta.env.DEV ? "http://localhost:5180" : "/");

/**
 * The board's room, apart from the todo and editor rooms. Bump the version when changing
 * INITIAL_SHAPES: tabs seeded with different shapes under the same ids stop agreeing.
 */
export const WHITEBOARD_ROOM = "homeostate-whiteboard-v1";

/** The room's document, restored from localStorage where available, and its provider. */
export const connectBoard = () =>
  connectSharedDoc(SYNC_SERVER_URL, WHITEBOARD_ROOM);
