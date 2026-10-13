import { describe, expect, it, vi } from "vitest";
import {
  createPersistence,
  createSyncEngine,
  type CrdtBackend,
  type PersistableDoc,
} from "../index.js";
import { createMemoryPersistenceAdapter } from "../testing.js";
import {
  addTodo,
  createTestStore,
  setSearchTerm,
  threeTodos,
  todo,
  toggleTodo,
  type TodoState,
} from "./helpers.js";

export interface PersistableDocHarness<D> {
  createDoc: () => D;
  persistable: (doc: D) => PersistableDoc;
  backend: (doc: D) => CrdtBackend;
  /** Bring both documents up to date with each other, as a provider would */
  exchange: (a: D, b: D) => void;
}

/**
 * Scenarios every `PersistableDoc` must pass together with its CRDT backend: a document
 * restored from storage behaves as if it had never been closed.
 */
export const describePersistableDoc = <D>(
  name: string,
  harness: PersistableDocHarness<D>,
): void => {
  const { createDoc, persistable, backend, exchange } = harness;

  const connect = (doc: D, initial: TodoState = threeTodos()) => {
    const store = createTestStore(initial);
    const engine = createSyncEngine(backend(doc), store.adapter);
    engine.connect();
    return store;
  };

  /** A page load: a new document restored from storage, then the engine connects. */
  const open = async (
    adapter = createMemoryPersistenceAdapter(),
    initial?: TodoState,
  ) => {
    const doc = createDoc();
    const persistence = createPersistence(persistable(doc), adapter, {
      key: "room",
    });
    await persistence.whenLoaded;
    return { doc, persistence, store: connect(doc, initial), adapter };
  };

  describe(`${name} persistence`, () => {
    it("restores the synced state into a new document", async () => {
      const first = await open();
      first.store.setState(addTodo(first.store.getState(), todo("4")));
      first.store.setState(setSearchTerm(first.store.getState(), "saved"));
      await first.persistence.destroy();

      const reloaded = await open(first.adapter, {
        todos: [],
        searchTerm: "",
        filterStatus: "all",
      });

      expect(reloaded.store.getState()).toEqual(first.store.getState());
    });

    it("merges a restored document with a peer without duplicating it", async () => {
      const first = await open();
      const peer = createDoc();
      exchange(first.doc, peer);
      const peerStore = connect(peer);
      first.store.setState(addTodo(first.store.getState(), todo("4")));
      exchange(first.doc, peer);
      await first.persistence.destroy();

      const reloaded = await open(first.adapter);
      reloaded.store.setState(toggleTodo(reloaded.store.getState(), "4"));
      peerStore.setState(addTodo(peerStore.getState(), todo("5")));
      exchange(reloaded.doc, peer);

      const expected = addTodo(
        toggleTodo(addTodo(threeTodos(), todo("4")), "4"),
        todo("5"),
      );
      expect(reloaded.store.getState()).toEqual(expected);
      expect(peerStore.getState()).toEqual(expected);
    });

    it("revives a room after every peer and the server left", async () => {
      const adapter = createMemoryPersistenceAdapter();
      const server = createDoc();
      const first = await open(adapter);
      exchange(first.doc, server);
      const second = connect(server);
      second.setState(addTodo(second.getState(), todo("4")));
      exchange(first.doc, server);
      await first.persistence.destroy();

      const freshServer = createDoc();
      const reloaded = await open(adapter);
      exchange(reloaded.doc, freshServer);
      const newcomer = createDoc();
      exchange(freshServer, newcomer);

      expect(
        connect(newcomer, {
          todos: [],
          searchTerm: "",
          filterStatus: "all",
        }).getState(),
      ).toEqual(addTodo(threeTodos(), todo("4")));
    });

    it("stores updates received from peers", async () => {
      const first = await open();
      const peer = createDoc();
      exchange(first.doc, peer);
      const peerStore = connect(peer);
      peerStore.setState(addTodo(peerStore.getState(), todo("remote")));
      exchange(first.doc, peer);
      await first.persistence.destroy();

      const reloaded = await open(first.adapter);

      expect(reloaded.store.getState().todos.map((t) => t.id)).toContain(
        "remote",
      );
    });

    it("does not report the updates it applies", () => {
      const source = createDoc();
      connect(source);
      const doc = createDoc();
      const target = persistable(doc);
      const onUpdate = vi.fn();
      target.subscribe(onUpdate);

      target.apply(persistable(source).encode());

      expect(backend(doc).read()).toEqual(threeTodos());
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("reports local edits as updates another document can apply", () => {
      const doc = createDoc();
      const updates: Uint8Array[] = [];
      persistable(doc).subscribe((update) => updates.push(update));
      const store = connect(doc);
      store.setState(toggleTodo(store.getState(), "2"));

      const copy = createDoc();
      const target = persistable(copy);
      for (const update of [...updates].reverse()) target.apply(update);
      for (const update of updates) target.apply(update);

      expect(backend(copy).read()).toEqual(store.getState());
    });

    it.each([
      ["before", true],
      ["after", false],
    ])(
      "reports what a store derives while an update is applied, subscribed %s the engine",
      (_, persistableFirst) => {
        const docs = [createDoc(), createDoc()];
        const persistables = docs.map(persistable);
        // Updates travel as a provider delivers them: later, one at a time.
        const inbox: Uint8Array[][] = [[], []];
        const relay = (from: number) =>
          persistables[from].subscribe((update) => {
            inbox[1 - from].push(update);
          });
        const deliver = () => {
          while (inbox[0].length > 0 || inbox[1].length > 0)
            for (const to of [0, 1]) {
              const update = inbox[to].shift();
              if (update !== undefined) persistables[to].apply(update);
            }
        };
        const initial = { todos: [] as string[], count: 0 };
        const stores = [createTestStore(initial), createTestStore(initial)];
        const deriving = stores[1];
        deriving.adapter.subscribe(() => {
          const state = deriving.getState();
          if (state.count !== state.todos.length)
            deriving.setState({ ...state, count: state.todos.length });
        });
        const engines = docs.map((doc, i) =>
          createSyncEngine(backend(doc), stores[i].adapter),
        );
        relay(0);
        engines[0].connect();
        deliver();
        if (persistableFirst) relay(1);
        engines[1].connect();
        if (!persistableFirst) relay(1);
        deliver();

        stores[0].setState({ todos: ["a", "b"], count: 0 });
        deliver();

        expect(stores[1].getState()).toEqual({ todos: ["a", "b"], count: 2 });
        expect(stores[0].getState()).toEqual({ todos: ["a", "b"], count: 2 });

        // A later edit of the deriving peer depends on the derived one.
        deriving.setState({ todos: ["a", "b", "c"], count: 3 });
        deliver();

        expect(stores[0].getState()).toEqual({
          todos: ["a", "b", "c"],
          count: 3,
        });
      },
    );
  });
};
