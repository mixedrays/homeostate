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

interface StandInOp {
  peer: number;
  seq: number;
  set: Record<string, unknown>;
  del: string[];
}

/** A stand-in document that can hold back its next update, to make a peer receive one early. */
export interface StandInDoc extends PersistableDoc {
  /** Keep the next local update from the network until `release()`. */
  holdBack: () => void;
  /** Send the update `holdBack()` kept. */
  release: () => void;
}

const encodeOps = (ops: StandInOp[]): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(ops));

/**
 * A stand-in CRDT whose updates are each peer's numbered writes. Like Yjs before task 127's
 * fix, an update that arrives before an earlier one from the same peer removes the keys it
 * replaces at once and waits for the earlier one to set them, so the document drops those keys
 * until the held-back update arrives. Concurrent writes apply in the order they arrive, so it
 * suits tests that write from one peer at a time.
 */
export const createStandIn = (
  index: number,
): { backend: CrdtBackend; doc: StandInDoc } => {
  const self = index + 1;
  let state: Record<string, unknown> = {};
  let seq = 0;
  const applied = new Map<number, number>();
  const log: StandInOp[] = [];
  let pending: StandInOp[] = [];
  const docListeners = new Set<(update: Uint8Array) => void>();
  const remoteListeners = new Set<() => void>();
  let holding = false;
  let held: Uint8Array | undefined;

  const run = (op: StandInOp): void => {
    const next = { ...state, ...op.set };
    for (const key of op.del) delete next[key];
    state = next;
    applied.set(op.peer, op.seq);
    log.push(op);
  };

  const emit = (update: Uint8Array): void =>
    docListeners.forEach((listener) => listener(update));

  const doc: StandInDoc = {
    encode: () => encodeOps(log),
    apply: (update) => {
      const ops = JSON.parse(new TextDecoder().decode(update)) as StandInOp[];
      const before = JSON.stringify(state);
      for (const op of ops) {
        const last = applied.get(op.peer) ?? 0;
        if (
          op.seq <= last ||
          pending.some((p) => p.peer === op.peer && p.seq === op.seq)
        )
          continue;
        if (op.seq > last + 1) {
          // The bug: what the update replaces goes now, its new values only with the gap filled.
          const next = { ...state };
          for (const key of [...Object.keys(op.set), ...op.del])
            delete next[key];
          state = next;
          pending.push(op);
          continue;
        }
        run(op);
        for (;;) {
          const ready = pending.find(
            (p) => p.seq === (applied.get(p.peer) ?? 0) + 1,
          );
          if (!ready) break;
          pending = pending.filter((p) => p !== ready);
          run(ready);
        }
      }
      if (JSON.stringify(state) !== before)
        remoteListeners.forEach((listener) => listener());
    },
    subscribe: (onUpdate) => {
      docListeners.add(onUpdate);
      return () => {
        docListeners.delete(onUpdate);
      };
    },
    holdBack: () => {
      holding = true;
    },
    release: () => {
      const update = held;
      held = undefined;
      if (update) emit(update);
    },
  };

  const backend: CrdtBackend = {
    read: () =>
      JSON.parse(JSON.stringify(state)) as ReturnType<CrdtBackend["read"]>,
    write: (next) => {
      const target = JSON.parse(JSON.stringify(next)) as Record<
        string,
        unknown
      >;
      const op: StandInOp = { peer: self, seq: seq + 1, set: {}, del: [] };
      for (const key of Object.keys(state))
        if (!(key in target)) op.del.push(key);
      for (const [key, value] of Object.entries(target))
        if (JSON.stringify(state[key]) !== JSON.stringify(value))
          op.set[key] = value;
      if (op.del.length === 0 && Object.keys(op.set).length === 0) return;
      seq++;
      run(op);
      const update = encodeOps([op]);
      if (holding) {
        holding = false;
        held = update;
      } else emit(update);
    },
    subscribe: (onRemoteChange) => {
      remoteListeners.add(onRemoteChange);
      return () => {
        remoteListeners.delete(onRemoteChange);
      };
    },
  };

  return { backend, doc };
};

/** `todoPeer` on a stand-in document, returned too so a test can hold back its updates. */
export const standInPeer = (
  index: number,
  extra: Partial<PeerSetup<TodoState>> = {},
): {
  store: StoreApi<TodoState>;
  setup: PeerSetup<TodoState>;
  doc: StandInDoc;
} => {
  const standIn = createStandIn(index);
  return {
    ...todoPeer(() => standIn, index, extra),
    doc: standIn.doc,
  };
};
