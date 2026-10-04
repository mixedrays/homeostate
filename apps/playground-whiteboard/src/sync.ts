import { connectSharedDoc } from "@homeostate/playground/shared";

export { SYNC_MAP_NAME } from "@homeostate/playground/shared";

export const SYNC_SERVER_URL: string =
  import.meta.env.VITE_SYNC_SERVER_URL ?? "ws://localhost:9999";

/** The React playground, whose landing page links here. */
export const REACT_PLAYGROUND_URL: string =
  import.meta.env.VITE_PLAYGROUND_REACT_URL ??
  (import.meta.env.DEV ? "http://localhost:5181" : "/react/");

/**
 * The board's room, apart from the todo and editor rooms. Bump the version when changing
 * INITIAL_SHAPES or `isShapeText`: tabs seeded with different shapes under the same ids stop
 * agreeing.
 */
export const WHITEBOARD_ROOM = "homeostate-whiteboard-v2";

/** The room's document, restored from localStorage where available, and its provider. */
export const connectBoard = () =>
  connectSharedDoc(SYNC_SERVER_URL, WHITEBOARD_ROOM);
