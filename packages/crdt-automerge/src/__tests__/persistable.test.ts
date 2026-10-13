import * as A from "@automerge/automerge";
import { describe, expect, it } from "vitest";
import { createSyncEngine, type StoreAdapter } from "@homeostate/core";
import { describePersistableDoc } from "@homeostate/core/conformance";
import {
  createAutomergeBackend,
  createAutomergeHandle,
  createAutomergePersistable,
  type AutomergeHandle,
} from "../index.js";

describePersistableDoc("createAutomergePersistable", {
  createDoc: () => createAutomergeHandle<Record<string, unknown>>(),
  persistable: createAutomergePersistable,
  backend: (handle) => createAutomergeBackend(handle, "shared"),
  exchange: (a, b) => {
    b.update((doc) => A.merge(doc, a.doc()));
    a.update((doc) => A.merge(doc, b.doc()));
  },
});

type Root = Record<string, unknown>;

/** A handle listener that changes the document whenever an update from a peer arrives. */
const deriveOnRemote = (handle: AutomergeHandle<Root>) =>
  handle.subscribe(({ local }) => {
    if (!local)
      handle.change((doc) => {
        doc.derived = ((doc.derived as number | undefined) ?? 0) + 1;
      });
  });

describe("createAutomergePersistable with a change made during apply", () => {
  const peerUpdate = A.save(
    A.change(A.init<Root>(), (doc) => {
      doc.remote = 1;
    }),
  );

  /** What a peer holding `peerUpdate` makes of `updates`. */
  const atPeer = (updates: Uint8Array[]): Root => {
    const peer = createAutomergePersistable(createAutomergeHandle<Root>());
    [peerUpdate, ...updates].forEach((update) => peer.apply(update));
    return JSON.parse(JSON.stringify(A.load(peer.encode())));
  };

  it.each([
    ["before", true],
    ["after", false],
  ])(
    "reports it when subscribed %s the listener making it",
    (_, persistableFirst) => {
      const handle = createAutomergeHandle<Root>();
      const persistable = createAutomergePersistable(handle);
      const updates: Uint8Array[] = [];
      const record = () =>
        persistable.subscribe((update) => {
          updates.push(update);
        });
      if (persistableFirst) record();
      deriveOnRemote(handle);
      if (!persistableFirst) record();

      persistable.apply(peerUpdate);

      expect(handle.doc()).toEqual({ remote: 1, derived: 1 });
      expect(atPeer(updates)).toEqual({ remote: 1, derived: 1 });
    },
  );

  it("does not report the applied update itself", () => {
    const handle = createAutomergeHandle<Root>();
    const persistable = createAutomergePersistable(handle);
    const updates: Uint8Array[] = [];
    persistable.subscribe((update) => {
      updates.push(update);
    });

    persistable.apply(peerUpdate);

    expect(handle.doc()).toEqual({ remote: 1 });
    expect(updates).toEqual([]);
  });
});

describe("two peers relaying through createAutomergePersistable", () => {
  interface Counted {
    todos: string[];
    count: number;
  }

  /** A store with a subscriber that keeps `count` in step with `todos`, as an app might. */
  const derivingStore = (derive: boolean) => {
    let state: Counted = { todos: [], count: 0 };
    const listeners = new Set<() => void>();
    const setState = (next: Counted): void => {
      state = next;
      listeners.forEach((listener) => listener());
    };
    if (derive)
      listeners.add(() => {
        if (state.count !== state.todos.length)
          setState({ ...state, count: state.todos.length });
      });
    const adapter: StoreAdapter<Counted> = {
      getState: () => state,
      setState,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    return { adapter, getState: () => state, setState };
  };

  it.each([
    ["before", true],
    ["after", false],
  ])(
    "converges on what one peer derives, with its relay subscribed %s its engine",
    (_, relayFirst) => {
      const handles = [
        createAutomergeHandle<Root>(),
        createAutomergeHandle<Root>(),
      ];
      const persistables = handles.map(createAutomergePersistable);
      // Updates are queued, so one relayed during another's apply waits for it to finish.
      const queue: [number, Uint8Array][] = [];
      let draining = false;
      const relay = (from: number) =>
        persistables[from].subscribe((update) => {
          queue.push([1 - from, update]);
          if (draining) return;
          draining = true;
          try {
            for (let next = queue.shift(); next; next = queue.shift())
              persistables[next[0]].apply(next[1]);
          } finally {
            draining = false;
          }
        });
      const stores = [derivingStore(false), derivingStore(true)];
      const backends = handles.map((handle) =>
        createAutomergeBackend(handle, "shared"),
      );

      relay(0);
      if (relayFirst) relay(1);
      createSyncEngine(backends[0], stores[0].adapter).connect();
      createSyncEngine(backends[1], stores[1].adapter).connect();
      if (!relayFirst) relay(1);

      stores[0].setState({ todos: ["a", "b"], count: 0 });

      expect(stores[1].getState()).toEqual({ todos: ["a", "b"], count: 2 });
      expect(backends[0].read()).toEqual({ todos: ["a", "b"], count: 2 });
      expect(stores[0].getState()).toEqual({ todos: ["a", "b"], count: 2 });

      // A later change of the deriving peer depends on the derived one.
      stores[1].setState({ todos: ["a", "b", "c"], count: 3 });

      expect(stores[0].getState()).toEqual({
        todos: ["a", "b", "c"],
        count: 3,
      });
    },
  );
});
