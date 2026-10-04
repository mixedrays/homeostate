import { create } from "zustand";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import type { DevtoolsSource } from "@homeostate/tool-devtools";
import { connectBoard, SYNC_MAP_NAME } from "../sync";
import { createIdentity } from "./presence";
import { seedBoard, type Board, type Shape } from "./shapes";

interface BoardStore extends Board {
  addShape: (id: string, shape: Shape) => void;
  /** Replaces the shape with `update(shape)`; does nothing if a peer deleted it meanwhile. */
  updateShape: (id: string, update: (shape: Shape) => Shape) => void;
  removeShape: (id: string) => void;
}

const has = (shapes: Board["shapes"], id: string) =>
  Object.prototype.hasOwnProperty.call(shapes, id);

/**
 * The board is a plain immutable record of shapes. The store knows nothing about CRDTs:
 * homeostate diffs each new record against the last one and writes only the fields that changed.
 */
export const useBoardStore = create<BoardStore>((set) => ({
  // Replaced on connect by the shapes the backend holds.
  shapes: {},
  addShape: (id, shape) =>
    set((state) => ({ shapes: { ...state.shapes, [id]: shape } })),
  updateShape: (id, update) =>
    set((state) =>
      has(state.shapes, id)
        ? { shapes: { ...state.shapes, [id]: update(state.shapes[id]) } }
        : state,
    ),
  removeShape: (id) =>
    set((state) => {
      if (!has(state.shapes, id)) return state;
      const shapes = { ...state.shapes };
      delete shapes[id];
      return { shapes };
    }),
}));

const { ydoc, wsProvider, persistence, network } = connectBoard();
seedBoard(ydoc);

const adapter = createZustandAdapter(useBoardStore);
const backend = createYjsBackend(ydoc, SYNC_MAP_NAME);
const syncEngine = createSyncEngine(backend, adapter);

syncEngine.connect();

/** The store as the devtools panel sees it. */
const devtoolsSource: DevtoolsSource = {
  name: "Whiteboard",
  adapter,
  backend,
  engine: syncEngine,
  persistence,
  network,
};

const awareness = wsProvider.awareness;
const identity = createIdentity();

export { awareness, devtoolsSource, identity, syncEngine, ydoc, wsProvider };
