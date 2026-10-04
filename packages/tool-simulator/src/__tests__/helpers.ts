import * as A from "@automerge/automerge";
import { LoroDoc } from "loro-crdt";
import * as Y from "yjs";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { CrdtBackend, PersistableDoc, TextPolicy } from "@homeostate/core";
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

type DocFactory = (
  index: number,
  text?: TextPolicy,
) => {
  backend: CrdtBackend;
  doc: PersistableDoc;
};

/** One document per peer, each with a fixed ID so runs replay exactly. */
export const backends: [string, DocFactory][] = [
  [
    "Yjs",
    (index, text) => {
      const doc = new Y.Doc();
      doc.clientID = index + 1;
      return {
        backend: createYjsBackend(doc, "shared", { text }),
        doc: createYjsPersistable(doc),
      };
    },
  ],
  [
    "Loro",
    (index, text) => {
      const doc = new LoroDoc();
      doc.setPeerId(index + 1);
      return {
        backend: createLoroBackend(doc, "shared", { text }),
        doc: createLoroPersistable(doc),
      };
    },
  ],
  [
    "Automerge",
    (index, text) => {
      const handle = createAutomergeHandle<Record<string, unknown>>(
        A.init({ actor: (index + 1).toString(16).padStart(8, "0") }),
      );
      return {
        backend: createAutomergeBackend(handle, "shared", { text }),
        doc: createAutomergePersistable(handle),
      };
    },
  ],
];

/**
 * Which strings each peer stores as text: none, all, or, with peers that disagree, all on even
 * peers and those at even depths on odd ones, so strings keep switching kind.
 */
export const textPolicies: [
  string,
  (index: number) => TextPolicy | undefined,
][] = [
  ["no text", () => undefined],
  ["text everywhere", () => () => true],
  [
    "peers that disagree on text",
    (index) => (index % 2 === 0 ? () => true : (path) => path.length % 2 === 0),
  ],
];

/** `docs` with each peer's backend storing the strings `text` names as text. */
export const withText =
  (
    docs: DocFactory,
    text: (index: number) => TextPolicy | undefined,
  ): DocFactory =>
  (index) =>
    docs(index, text(index));

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
