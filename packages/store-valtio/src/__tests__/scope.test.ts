import { describe, expect, it, vi } from "vitest";
import { proxy } from "valtio/vanilla";
import { createSyncEngine, scopeAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createValtioAdapter } from "../index.js";

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
  proxy<Root>({
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

describe("scopeAdapter over a Valtio proxy", () => {
  it("reconciles a remote change into the slice, leaving the rest of the proxy untouched", () => {
    const state = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createValtioAdapter(state), docScope),
    ).connect();
    const { notes, ui } = state;
    const item = state.doc.items[0];

    backend.receive({ title: "remote", items: [{ id: "1" }] });

    expect(state.doc.title).toBe("remote");
    expect(state.doc.items[0]).toBe(item);
    expect(state.notes).toBe(notes);
    expect(state.ui).toBe(ui);

    state.doc.title = "local";

    expect(backend.read()).toEqual({ title: "local", items: [{ id: "1" }] });
  });

  it("adds no write for a change outside the slice", () => {
    const state = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createValtioAdapter(state), docScope),
    ).connect();
    const write = vi.spyOn(backend, "write");

    state.ui.open = true;
    state.notes.title = "edited";

    expect(write).not.toHaveBeenCalled();
  });

  it("does not tell the other scoped adapter of a remote change", () => {
    const state = createRoot();
    const docBackend = createMemoryBackend();
    const notesBackend = createMemoryBackend();
    const adapter = createValtioAdapter(state);
    createSyncEngine(docBackend, scopeAdapter(adapter, docScope)).connect();
    createSyncEngine(notesBackend, scopeAdapter(adapter, notesScope)).connect();
    const notesWrite = vi.spyOn(notesBackend, "write");

    docBackend.receive({ title: "remote", items: [] });

    expect(state.doc.title).toBe("remote");
    expect(notesWrite).not.toHaveBeenCalled();
  });

  it("keeps syncing when the app replaces the slice's object", () => {
    const state = createRoot();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createValtioAdapter(state), docScope),
    ).connect();

    state.doc = { title: "replaced", items: [] };

    expect(backend.read()).toEqual({ title: "replaced", items: [] });

    backend.receive({ title: "remote", items: [] });

    expect(state.doc.title).toBe("remote");
  });
});
