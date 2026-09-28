import { create } from "zustand";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import { EDITOR_ROOM, SYNC_MAP_NAME, connectSharedDoc } from "../../sync";
import { seedDocument, sharedText } from "../document";
import {
  createIdentity,
  readStoredName,
  setLocalUser,
  toUser,
} from "../presence";

interface EditorStore {
  text: string;
  setText: (text: string) => void;
}

/**
 * The whole document is one string. The store knows nothing about CRDTs: homeostate diffs
 * each new string against the last one and writes only the characters that changed.
 */
export const useEditorStore = create<EditorStore>((set) => ({
  // Replaced on connect by the text the backend holds.
  text: "",
  setText: (text) => set({ text }),
}));

const { ydoc, wsProvider } = connectSharedDoc(EDITOR_ROOM);
seedDocument(ydoc);

const syncEngine = createSyncEngine(
  createYjsBackend(ydoc, SYNC_MAP_NAME),
  createZustandAdapter(useEditorStore),
);

syncEngine.connect();

const text = sharedText(ydoc);
const awareness = wsProvider.awareness;
const identity = createIdentity();

setLocalUser(awareness, toUser(identity, readStoredName()));

export { awareness, identity, syncEngine, text, ydoc, wsProvider };
