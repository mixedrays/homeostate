import { describe, expect, it, vi } from "vitest";
import { combineReducers, configureStore, createSlice } from "@reduxjs/toolkit";
import { createSyncEngine, scopeAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createReduxAdapter, withHomeostate } from "../index.js";

interface Doc {
  title: string;
}

const doc = createSlice({
  name: "doc",
  initialState: { title: "doc" } as Doc,
  reducers: {
    renamed: (state, action: { payload: string }) => {
      state.title = action.payload;
    },
  },
});

const notes = createSlice({
  name: "notes",
  initialState: { title: "notes" } as Doc,
  reducers: {
    renamed: (state, action: { payload: string }) => {
      state.title = action.payload;
    },
  },
});

const ui = createSlice({
  name: "ui",
  initialState: { open: false },
  reducers: {
    toggled: (state) => {
      state.open = !state.open;
    },
  },
});

const rootReducer = combineReducers({
  doc: doc.reducer,
  notes: notes.reducer,
  ui: ui.reducer,
});

type Root = ReturnType<typeof rootReducer>;

const docScope = {
  get: (state: Root) => state.doc,
  set: (state: Root, next: Doc) => ({ ...state, doc: next }),
};

const notesScope = {
  get: (state: Root) => state.notes,
  set: (state: Root, next: Doc) => ({ ...state, notes: next }),
};

const createStore = () =>
  configureStore({ reducer: withHomeostate(rootReducer) });

describe("scopeAdapter over a Redux store", () => {
  it("syncs a slice, leaving the rest of the store to its reducers", () => {
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createReduxAdapter(store), docScope),
    ).connect();
    const { notes: notesBefore, ui: uiBefore } = store.getState();

    backend.receive({ title: "remote" });

    expect(store.getState().doc).toEqual({ title: "remote" });
    expect(store.getState().notes).toBe(notesBefore);
    expect(store.getState().ui).toBe(uiBefore);

    store.dispatch(doc.actions.renamed("local"));

    expect(backend.read()).toEqual({ title: "local" });
  });

  it("adds no write for a dispatch to an unrelated slice", () => {
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createReduxAdapter(store), docScope),
    ).connect();
    const write = vi.spyOn(backend, "write");

    store.dispatch(ui.actions.toggled());
    store.dispatch(ui.actions.toggled());

    expect(write).not.toHaveBeenCalled();
  });

  it("syncs two slices to two backends independently", () => {
    const store = createStore();
    const docBackend = createMemoryBackend();
    const notesBackend = createMemoryBackend();
    const adapter = createReduxAdapter(store);
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

    store.dispatch(notes.actions.renamed("local"));

    expect(notesBackend.read()).toEqual({ title: "local" });
    expect(docWrite).not.toHaveBeenCalled();
  });

  it("writes back what a reducer normalises while a remote change is applied", () => {
    const trimming = withHomeostate(rootReducer);
    const store = configureStore({
      reducer: (state: Root | undefined, action: { type: string }) => {
        const next = trimming(state, action);
        const title = next.doc.title.trim();
        return title === next.doc.title ? next : { ...next, doc: { title } };
      },
    });
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      scopeAdapter(createReduxAdapter(store), docScope),
    ).connect();

    backend.receive({ title: "  spaced  " });

    expect(store.getState().doc).toEqual({ title: "spaced" });
    expect(backend.read()).toEqual({ title: "spaced" });
  });

  it("keeps the room when the store has no case for the replace action", () => {
    const store = configureStore({ reducer: rootReducer });
    const backend = createMemoryBackend({ title: "room" });
    createSyncEngine(
      backend,
      scopeAdapter(createReduxAdapter(store), {
        get: (state: Root) => ({ title: state.doc.title }),
        set: (state: Root, next: Doc) => ({ ...state, doc: next }),
      }),
    ).connect();

    expect(store.getState().doc).toEqual({ title: "doc" });
    expect(backend.read()).toEqual({ title: "room" });
  });
});
