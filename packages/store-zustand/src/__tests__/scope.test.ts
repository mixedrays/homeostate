import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { createSyncEngine, scopeAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createZustandAdapter } from "../index.js";

interface Doc {
  title: string;
}

interface Root {
  doc: Doc;
  notes: Doc;
  ui: { open: boolean };
  toggle: () => void;
}

const docScope = {
  get: (state: Root) => state.doc,
  set: (state: Root, doc: Doc) => ({ ...state, doc }),
};

const notesScope = {
  get: (state: Root) => state.notes,
  set: (state: Root, notes: Doc) => ({ ...state, notes }),
};

const createRoot = () =>
  createStore<Root>((set) => ({
    doc: { title: "doc" },
    notes: { title: "notes" },
    ui: { open: false },
    toggle: () => set((state) => ({ ui: { open: !state.ui.open } })),
  }));

describe("scopeAdapter over a Zustand store", () => {
  it("syncs a slice, leaving the rest of the store and its actions untouched", () => {
    const store = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createZustandAdapter(store), docScope),
    ).connect();
    const { notes, ui, toggle } = store.getState();

    backend.receive({ title: "remote" });

    expect(store.getState().doc).toEqual({ title: "remote" });
    expect(store.getState().notes).toBe(notes);
    expect(store.getState().ui).toBe(ui);
    expect(store.getState().toggle).toBe(toggle);

    store.setState({ doc: { title: "local" } });

    expect(backend.read()).toEqual({ title: "local" });
  });

  it("adds no write for a change outside the slice", () => {
    const store = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createZustandAdapter(store), docScope),
    ).connect();
    const write = vi.spyOn(backend, "write");

    store.getState().toggle();
    store.setState({ notes: { title: "edited" } });

    expect(write).not.toHaveBeenCalled();
  });

  it("syncs two slices to two backends independently", () => {
    const store = createRoot();
    const docBackend = createMemoryBackend();
    const notesBackend = createMemoryBackend();
    const adapter = createZustandAdapter(store);
    createSyncEngine(docBackend, scopeAdapter(adapter, docScope)).connect();
    createSyncEngine(notesBackend, scopeAdapter(adapter, notesScope)).connect();
    const docWrite = vi.spyOn(docBackend, "write");
    const notesWrite = vi.spyOn(notesBackend, "write");

    docBackend.receive({ title: "remote doc" });
    notesBackend.receive({ title: "remote notes" });

    expect(store.getState().doc).toEqual({ title: "remote doc" });
    expect(store.getState().notes).toEqual({ title: "remote notes" });
    expect(docWrite).not.toHaveBeenCalled();
    expect(notesWrite).not.toHaveBeenCalled();

    store.setState({ notes: { title: "local" } });

    expect(notesBackend.read()).toEqual({ title: "local" });
    expect(docWrite).not.toHaveBeenCalled();
  });

  it("lets the room win when connected after an async persist has hydrated the store", async () => {
    const stored = { state: { doc: { title: "persisted" } }, version: 0 };
    const store = create<{ doc: Doc }>()(
      persist(() => ({ doc: { title: "initial" } }), {
        name: "doc",
        storage: {
          getItem: () => Promise.resolve(stored),
          setItem: () => {},
          removeItem: () => {},
        },
      }),
    );
    const backend = createMemoryBackend({ title: "room" });
    const engine = createSyncEngine(
      backend,
      scopeAdapter(createZustandAdapter(store), {
        get: (state) => state.doc,
        set: (state, doc) => ({ ...state, doc }),
      }),
    );

    await new Promise<void>((resolve) =>
      store.persist.onFinishHydration(() => resolve()),
    );
    engine.connect();

    expect(store.getState().doc).toEqual({ title: "room" });
    expect(backend.read()).toEqual({ title: "room" });
  });

  it("syncs an array slice through a wrapper object", () => {
    const store = createStore(() => ({ todos: ["a"], ui: 0 }));
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createZustandAdapter(store), {
        get: (state) => ({ todos: state.todos }),
        set: (state, { todos }) => ({ ...state, todos }),
      }),
    ).connect();
    const write = vi.spyOn(backend, "write");

    store.setState({ ui: 1 });

    expect(write).not.toHaveBeenCalled();

    backend.receive({ todos: ["a", "b"] });

    expect(store.getState().todos).toEqual(["a", "b"]);

    store.setState({ todos: ["c"] });

    expect(backend.read()).toEqual({ todos: ["c"] });
  });
});
