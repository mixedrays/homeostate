import * as A from "@automerge/automerge";
import { LoroDoc } from "loro-crdt";
import * as Y from "yjs";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { CrdtBackend, PersistableDoc } from "@homeostate/core";
import {
  createAutomergeBackend,
  createAutomergeHandle,
  createAutomergePersistable,
} from "@homeostate/crdt-automerge";
import {
  createLoroBackend,
  createLoroPersistable,
} from "@homeostate/crdt-loro";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import type { PeerSetup } from "../index";

export interface TodoState {
  todos: { title: string; done: boolean }[];
  title: string;
  meta: Record<string, unknown>;
}

export const initialState = (): TodoState => ({
  todos: [],
  title: "",
  meta: {},
});

type DocFactory = (index: number) => {
  backend: CrdtBackend;
  doc: PersistableDoc;
};

/** One document per peer, each with a fixed ID so runs replay exactly. */
export const backends: [string, DocFactory][] = [
  [
    "Yjs",
    (index) => {
      const doc = new Y.Doc();
      doc.clientID = index + 1;
      return {
        backend: createYjsBackend(doc, "shared"),
        doc: createYjsPersistable(doc),
      };
    },
  ],
  [
    "Loro",
    (index) => {
      const doc = new LoroDoc();
      doc.setPeerId(index + 1);
      return {
        backend: createLoroBackend(doc, "shared"),
        doc: createLoroPersistable(doc),
      };
    },
  ],
  [
    "Automerge",
    (index) => {
      const handle = createAutomergeHandle<Record<string, unknown>>(
        A.init({ actor: (index + 1).toString(16).padStart(8, "0") }),
      );
      return {
        backend: createAutomergeBackend(handle, "shared"),
        doc: createAutomergePersistable(handle),
      };
    },
  ],
];

/** A Zustand store on one of `backends`, and the setup that adds it to a network. */
export const todoPeer = (
  docs: DocFactory,
  index: number,
  extra: Partial<PeerSetup<TodoState>> = {},
): { store: StoreApi<TodoState>; setup: PeerSetup<TodoState> } => {
  const store = createStore<TodoState>(() => initialState());
  return {
    store,
    setup: { adapter: createZustandAdapter(store), ...docs(index), ...extra },
  };
};
