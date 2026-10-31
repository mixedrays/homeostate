import { describe, expect, it, vi } from "vitest";
import { observable, runInAction } from "mobx";
import { createSyncEngine, scopeAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createMobxAdapter } from "../index.js";

interface Doc {
  title: string;
  items: { id: string }[];
}

interface Root {
  doc: Doc;
  notes: Doc;
  ui: { open: boolean };
}

const createRoot = () =>
  observable<Root>({
    doc: { title: "doc", items: [{ id: "1" }] },
    notes: { title: "notes", items: [] },
    ui: { open: false },
  });

const docScope = {
  get: (state: Root) => state.doc,
  set: (state: Root, doc: Doc) => ({ ...state, doc }),
};

const notesScope = {
  get: (state: Root) => state.notes,
  set: (state: Root, notes: Doc) => ({ ...state, notes }),
};

describe("scopeAdapter over a MobX store", () => {
  it("reconciles a remote change into the slice, leaving the rest of the store untouched", () => {
    const store = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createMobxAdapter(store), docScope),
    ).connect();
    const { notes, ui } = store;
    const item = store.doc.items[0];

    backend.receive({ title: "remote", items: [{ id: "1" }] });

    expect(store.doc.title).toBe("remote");
    expect(store.doc.items[0]).toBe(item);
    expect(store.notes).toBe(notes);
    expect(store.ui).toBe(ui);

    runInAction(() => {
      store.doc.title = "local";
    });

    expect(backend.read()).toEqual({ title: "local", items: [{ id: "1" }] });
  });

  it("adds no write for a change outside the slice, though every snapshot is a fresh copy", () => {
    const store = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createMobxAdapter(store), docScope),
    ).connect();
    const write = vi.spyOn(backend, "write");

    runInAction(() => {
      store.ui.open = true;
    });
    runInAction(() => {
      store.notes.title = "edited";
    });

    expect(write).not.toHaveBeenCalled();
  });

  it("does not tell the other scoped adapter of a remote change", () => {
    const store = createRoot();
    const docBackend = createMemoryBackend();
    const notesBackend = createMemoryBackend();
    const adapter = createMobxAdapter(store);
    createSyncEngine(docBackend, scopeAdapter(adapter, docScope)).connect();
    createSyncEngine(notesBackend, scopeAdapter(adapter, notesScope)).connect();
    const notesWrite = vi.spyOn(notesBackend, "write");

    docBackend.receive({ title: "remote", items: [] });

    expect(store.doc.title).toBe("remote");
    expect(notesWrite).not.toHaveBeenCalled();
  });

  it("keeps syncing when the app replaces the slice's object", () => {
    const store = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createMobxAdapter(store), docScope),
    ).connect();

    runInAction(() => {
      store.doc = { title: "replaced", items: [] };
    });

    expect(backend.read()).toEqual({ title: "replaced", items: [] });

    backend.receive({ title: "remote", items: [] });

    expect(store.doc.title).toBe("remote");
  });
});
