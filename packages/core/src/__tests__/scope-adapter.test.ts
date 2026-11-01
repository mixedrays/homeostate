import { describe, expect, it, vi } from "vitest";
import {
  createSyncEngine,
  scopeAdapter,
  type StoreAdapter,
  type SyncEngineConfig,
} from "../index.js";
import { createMemoryBackend } from "../testing.js";
import { createTestStore, snapshot } from "./helpers.js";

interface Doc {
  title: string;
  body?: string;
}

interface Root {
  doc: Doc;
  notes: Doc;
  ui: { open: boolean };
}

const root = (): Root => ({
  doc: { title: "doc" },
  notes: { title: "notes" },
  ui: { open: false },
});

const docScope = {
  get: (state: Root) => state.doc,
  set: (state: Root, doc: Doc) => ({ ...state, doc }),
};

describe("scopeAdapter", () => {
  it("syncs the slice and leaves the rest of the store untouched", () => {
    const store = createTestStore(root());
    const backend = createMemoryBackend();
    createSyncEngine(backend, scopeAdapter(store.adapter, docScope)).connect();
    const { notes, ui } = store.getState();

    expect(backend.read()).toEqual({ title: "doc" });

    backend.receive({ title: "remote" });

    expect(store.getState().doc).toEqual({ title: "remote" });
    expect(store.getState().notes).toBe(notes);
    expect(store.getState().ui).toBe(ui);

    store.update((state) => ({ ...state, doc: { title: "local" } }));

    expect(backend.read()).toEqual({ title: "local" });
  });

  it("ignores store changes outside the slice", () => {
    const store = createTestStore(root());
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      scopeAdapter(store.adapter, docScope),
    );
    engine.connect();
    const revision = backend.revision();
    const events: string[] = [];
    engine.subscribe((event) => events.push(event));

    store.update((state) => ({ ...state, ui: { open: true } }));
    store.update((state) => ({ ...state, notes: { title: "edited" } }));

    expect(backend.revision()).toBe(revision);
    expect(events).toEqual([]);
  });

  it("writes a change back to an earlier value of the slice", () => {
    const store = createTestStore(root());
    const backend = createMemoryBackend();
    createSyncEngine(backend, scopeAdapter(store.adapter, docScope)).connect();

    store.update((state) => ({ ...state, doc: { title: "second" } }));
    store.update((state) => ({ ...state, doc: { title: "doc" } }));

    expect(backend.read()).toEqual({ title: "doc" });

    backend.receive({ title: "remote" });
    store.update((state) => ({ ...state, doc: { title: "doc" } }));

    expect(backend.read()).toEqual({ title: "doc" });
  });

  it("takes a slice with the same JSON for unchanged, as with a store that copies its state", () => {
    const store = createTestStore(root());
    const copying: StoreAdapter<Root> = {
      ...store.adapter,
      getState: () => snapshot(store.getState()),
    };
    const backend = createMemoryBackend();
    createSyncEngine(backend, scopeAdapter(copying, docScope)).connect();
    const revision = backend.revision();

    store.update((state) => ({ ...state, ui: { open: true } }));

    expect(backend.revision()).toBe(revision);

    store.update((state) => ({ ...state, doc: { title: "local" } }));

    expect(backend.read()).toEqual({ title: "local" });
  });

  describe("with a get that builds an object", () => {
    const titleScope = {
      get: (state: Root) => ({ title: state.doc.title }),
      set: (state: Root, { title }: { title: string }) => ({
        ...state,
        doc: { ...state.doc, title },
      }),
    };

    it("writes nothing for store changes outside the slice", () => {
      const store = createTestStore(root());
      const backend = createMemoryBackend();
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, titleScope),
      ).connect();
      const revision = backend.revision();

      store.update((state) => ({ ...state, ui: { open: true } }));

      expect(backend.revision()).toBe(revision);
    });

    it("keeps the room when the store ignores what it is given", () => {
      const store = createTestStore(root());
      const ignoring: StoreAdapter<Root> = {
        ...store.adapter,
        setState: () => {},
      };
      const backend = createMemoryBackend({ title: "room" });
      createSyncEngine(backend, scopeAdapter(ignoring, titleScope)).connect();

      expect(backend.read()).toEqual({ title: "room" });

      backend.receive({ title: "peer" });

      expect(backend.read()).toEqual({ title: "peer" });
      expect(store.getState().doc.title).toBe("doc");
    });
  });

  describe("when get throws on a store change", () => {
    interface Nested {
      outer?: { inner: Doc };
    }

    const innerScope = {
      get: (state: Nested) => state.outer!.inner,
      set: (state: Nested, inner: Doc) => ({ ...state, outer: { inner } }),
    };

    const setup = (onError?: SyncEngineConfig["onError"]) => {
      const store = createTestStore<Nested>({
        outer: { inner: { title: "inner" } },
      });
      createSyncEngine(
        createMemoryBackend(),
        scopeAdapter(store.adapter, innerScope),
        onError && { onError },
      ).connect();
      return store;
    };

    it("reports it to onError, as with what any adapter throws", () => {
      const onError = vi.fn();
      const store = setup(onError);

      expect(() => store.setState({})).not.toThrow();

      expect(onError).toHaveBeenCalledExactlyOnceWith(
        expect.any(TypeError),
        "store",
      );
    });

    it("reaches whoever changed the store without onError", () => {
      const store = setup();

      expect(() => store.setState({})).toThrow(TypeError);
    });
  });

  describe("when the slice is absent", () => {
    interface Optional {
      doc?: Doc;
      count: number;
    }

    const optionalScope = {
      get: (state: Optional) => state.doc as Doc,
      set: (state: Optional, doc: Doc) => ({ ...state, doc }),
    };

    const emptyByDefault = {
      get: (state: Optional) => state.doc ?? ({} as Doc),
      set: optionalScope.set,
    };

    it("makes connect throw and leaves the room alone", () => {
      const store = createTestStore<Optional>({ count: 0 });
      const backend = createMemoryBackend({ title: "room" });
      const engine = createSyncEngine(
        backend,
        scopeAdapter(store.adapter, optionalScope),
      );

      expect(() => engine.connect()).toThrow(TypeError);

      expect(engine.isConnected()).toBe(false);
      expect(backend.read()).toEqual({ title: "room" });
    });

    it("reports a removed slice and keeps the room", () => {
      const store = createTestStore<Optional>({
        doc: { title: "doc" },
        count: 0,
      });
      const backend = createMemoryBackend();
      const onError = vi.fn();
      createSyncEngine(backend, scopeAdapter(store.adapter, optionalScope), {
        onError,
      }).connect();

      store.setState({ count: 0 });

      expect(onError).toHaveBeenCalledExactlyOnceWith(
        expect.any(TypeError),
        "store",
      );
      expect(backend.read()).toEqual({ title: "doc" });
    });

    it("lets a returning slice overwrite the room, with what peers wrote meanwhile", () => {
      const store = createTestStore<Optional>({
        doc: { title: "doc" },
        count: 0,
      });
      const backend = createMemoryBackend();
      createSyncEngine(backend, scopeAdapter(store.adapter, optionalScope), {
        onError: () => {},
      }).connect();
      store.setState({ count: 0 });

      backend.receive({ title: "peer" });
      store.setState({ doc: { title: "returned" }, count: 0 });

      expect(backend.read()).toEqual({ title: "returned" });
    });

    it("connects with a get that falls back to an empty object", () => {
      const store = createTestStore<Optional>({ count: 0 });
      const backend = createMemoryBackend({ title: "room" });
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, emptyByDefault),
      ).connect();

      expect(store.getState().doc).toEqual({ title: "room" });
    });

    it("writes nothing for an absent slice's fallback until the store creates the slice", () => {
      const store = createTestStore<Optional>({ count: 0 });
      const backend = createMemoryBackend();
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, emptyByDefault),
      ).connect();
      const revision = backend.revision();

      store.update((state) => ({ ...state, count: 1 }));

      expect(backend.revision()).toBe(revision);

      store.update((state) => ({ ...state, doc: { title: "made" } }));

      expect(backend.read()).toEqual({ title: "made" });
    });

    it("wipes the room when the store removes a slice that falls back to an empty object", () => {
      const store = createTestStore<Optional>({
        doc: { title: "doc" },
        count: 0,
      });
      const backend = createMemoryBackend();
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, emptyByDefault),
      ).connect();

      store.setState({ count: 0 });

      expect(backend.read()).toEqual({});
    });

    it("leaves an empty slice when a peer removes every key", () => {
      const store = createTestStore(root());
      const backend = createMemoryBackend();
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, docScope),
      ).connect();

      backend.receive({});

      expect(store.getState().doc).toEqual({});
    });
  });

  describe("with two scoped adapters on one store", () => {
    const notesScope = {
      get: (state: Root) => state.notes,
      set: (state: Root, notes: Doc) => ({ ...state, notes }),
    };

    const setup = (prepare?: (next: Root) => Root) => {
      const store = createTestStore(root(), prepare);
      const docBackend = createMemoryBackend();
      const notesBackend = createMemoryBackend();
      const notesEvents: string[] = [];
      createSyncEngine(
        docBackend,
        scopeAdapter(store.adapter, docScope),
      ).connect();
      const notesEngine = createSyncEngine(
        notesBackend,
        scopeAdapter(store.adapter, notesScope),
      );
      notesEngine.subscribe((event) => notesEvents.push(event));
      notesEngine.connect();
      notesEvents.length = 0;
      return { store, docBackend, notesBackend, notesEvents };
    };

    it("applies a remote change on one without telling the other", () => {
      const { store, docBackend, notesBackend, notesEvents } = setup();
      const revision = notesBackend.revision();

      docBackend.receive({ title: "remote" });

      expect(store.getState().doc).toEqual({ title: "remote" });
      expect(notesBackend.revision()).toBe(revision);
      expect(notesEvents).toEqual([]);
    });

    it("writes each slice to its own backend", () => {
      const { store, docBackend, notesBackend } = setup();

      store.update((state) => ({ ...state, notes: { title: "edited" } }));

      expect(notesBackend.read()).toEqual({ title: "edited" });
      expect(docBackend.read()).toEqual({ title: "doc" });
    });

    it("hears a change the store makes to its slice while the other's remote change is applied", () => {
      const { docBackend, notesBackend } = setup((next) =>
        next.doc.title === "doc"
          ? next
          : { ...next, notes: { title: next.doc.title } },
      );

      docBackend.receive({ title: "remote" });

      expect(notesBackend.read()).toEqual({ title: "remote" });
    });
  });

  describe("when the store changes the slice during setState", () => {
    const trimming = (next: Root): Root =>
      next.doc.title === next.doc.title.trim()
        ? next
        : { ...next, doc: { title: next.doc.title.trim() } };

    it("writes what the store made of it once, and nothing for later changes elsewhere", () => {
      const store = createTestStore(root(), trimming);
      const backend = createMemoryBackend();
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, docScope),
      ).connect();

      backend.receive({ title: "  spaced  " });

      expect(backend.read()).toEqual({ title: "spaced" });

      const revision = backend.revision();
      store.update((state) => ({ ...state, ui: { open: true } }));

      expect(backend.revision()).toBe(revision);
    });

    /** A store that answers a remote `doc` titled "bad" with `reject`. */
    const rejecting = (reject: (previous: Doc) => Doc) => {
      const store = createTestStore(root());
      const adapter: StoreAdapter<Root> = {
        ...store.adapter,
        setState: (next) =>
          store.setState(
            next.doc.title === "bad"
              ? { ...next, doc: reject(store.getState().doc) }
              : next,
          ),
      };
      return { store, adapter };
    };

    it("takes a new root keeping the slice's object as ignored, so room and store disagree until the next local write", () => {
      const { store, adapter } = rejecting((previous) => previous);
      const backend = createMemoryBackend();
      createSyncEngine(backend, scopeAdapter(adapter, docScope)).connect();

      backend.receive({ title: "bad" });

      expect(store.getState().doc).toEqual({ title: "doc" });
      expect(backend.read()).toEqual({ title: "bad" });

      store.update((state) => ({ ...state, doc: { title: "local" } }));

      expect(backend.read()).toEqual({ title: "local" });
    });

    it("writes back a rejection that makes a new object for the slice", () => {
      const { store, adapter } = rejecting((previous) => ({ ...previous }));
      const backend = createMemoryBackend();
      createSyncEngine(backend, scopeAdapter(adapter, docScope)).connect();

      backend.receive({ title: "bad" });

      expect(store.getState().doc).toEqual({ title: "doc" });
      expect(backend.read()).toEqual({ title: "doc" });
    });

    it("differs from an unscoped adapter, which writes the same rejection back", () => {
      const { store, adapter } = rejecting((previous) => previous);
      const backend = createMemoryBackend();
      createSyncEngine(backend, adapter).connect();

      backend.receive({ ...store.getState(), doc: { title: "bad" } });

      expect(backend.read().doc).toEqual({ title: "doc" });
    });
  });

  describe("with room keys the slice does not sync", () => {
    it("keeps them in the slice without keys", () => {
      const store = createTestStore(root());
      const backend = createMemoryBackend({ title: "room", extra: 1 });
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, docScope),
      ).connect();

      store.update((state) => ({
        ...state,
        doc: { ...state.doc, title: "local" },
      }));

      expect(backend.read()).toEqual({ title: "local", extra: 1 });
    });

    it("removes them from the room with the next local change under keys", () => {
      const store = createTestStore(root());
      const backend = createMemoryBackend({ title: "room", extra: 1 });
      createSyncEngine(backend, scopeAdapter(store.adapter, docScope), {
        keys: ["title"],
      }).connect();

      expect(backend.read()).toEqual({ title: "room", extra: 1 });

      store.update((state) => ({ ...state, doc: { title: "local" } }));

      expect(backend.read()).toEqual({ title: "local" });
    });

    it("removes them at once when set drops them", () => {
      const store = createTestStore(root());
      const backend = createMemoryBackend({ title: "room", extra: 1 });
      createSyncEngine(
        backend,
        scopeAdapter(store.adapter, {
          get: docScope.get,
          set: (state, { title }) => ({ ...state, doc: { title } }),
        }),
      ).connect();

      expect(backend.read()).toEqual({ title: "room" });
    });
  });

  it("applies the engine's filter to the slice's keys", () => {
    const store = createTestStore(root());
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      scopeAdapter(store.adapter, docScope),
      { filter: (key) => key !== "title" },
    );

    expect(engine.getSyncedState()).toEqual({});

    store.update((state) => ({ ...state, doc: { title: "t", body: "b" } }));

    expect(engine.getSyncedState()).toEqual({ body: "b" });
  });

  it("stops listening when the engine disconnects", () => {
    const store = createTestStore(root());
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      scopeAdapter(store.adapter, docScope),
    );
    engine.connect();
    engine.disconnect();
    const revision = backend.revision();

    store.update((state) => ({ ...state, doc: { title: "offline" } }));

    expect(backend.revision()).toBe(revision);
  });
});
