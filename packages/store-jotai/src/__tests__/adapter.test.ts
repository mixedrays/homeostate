import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { atom, createStore, getDefaultStore } from "jotai/vanilla";
import { atomWithReset, atomWithStorage } from "jotai/vanilla/utils";
import { createSyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createJotaiAdapter } from "../index.js";

interface Counter {
  count: number;
  label: string;
}

describe("JotaiAdapter", () => {
  it("seeds the backend, writes atom changes, and applies remote changes", () => {
    const counterAtom = atom<Counter>({ count: 0, label: "a" });
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      createJotaiAdapter(counterAtom, store),
    );

    engine.connect();
    expect(backend.read()).toEqual({ count: 0, label: "a" });

    store.set(counterAtom, (prev) => ({ ...prev, count: 1 }));
    expect(backend.read()).toEqual({ count: 1, label: "a" });

    backend.receive({ count: 5, label: "b" });
    expect(store.get(counterAtom)).toEqual({ count: 5, label: "b" });
  });

  it("adopts a non-empty backend as the initial state", () => {
    const counterAtom = atom<Counter>({ count: 0, label: "a" });
    const store = createStore();
    const backend = createMemoryBackend({ count: 7, label: "z" });

    createSyncEngine(backend, createJotaiAdapter(counterAtom, store)).connect();

    expect(store.get(counterAtom)).toEqual({ count: 7, label: "z" });
  });

  it("uses the default store when none is given", () => {
    const counterAtom = atom<Counter>({ count: 0, label: "a" });
    const backend = createMemoryBackend();

    createSyncEngine(backend, createJotaiAdapter(counterAtom)).connect();
    getDefaultStore().set(counterAtom, { count: 3, label: "a" });

    expect(backend.read()).toEqual({ count: 3, label: "a" });
  });

  it("syncs a derived writable atom that spans several atoms", () => {
    const countAtom = atom(0);
    const labelAtom = atom("a");
    const rootAtom = atom(
      (get) => ({ count: get(countAtom), label: get(labelAtom) }),
      (_get, set, next: Counter) => {
        set(countAtom, next.count);
        set(labelAtom, next.label);
      },
    );
    const store = createStore();
    const backend = createMemoryBackend();

    createSyncEngine(backend, createJotaiAdapter(rootAtom, store)).connect();
    store.set(countAtom, 2);
    expect(backend.read()).toEqual({ count: 2, label: "a" });

    backend.receive({ count: 9, label: "q" });
    expect(store.get(countAtom)).toBe(9);
    expect(store.get(labelAtom)).toBe("q");
  });

  it("writes what a root atom that normalises its write makes of a remote change", () => {
    const countAtom = atom(0);
    const labelAtom = atom("a");
    const rootAtom = atom(
      (get) => ({ count: get(countAtom), label: get(labelAtom) }),
      (_get, set, next: Counter) => {
        set(countAtom, Math.min(next.count, 10));
        set(labelAtom, next.label);
      },
    );
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(rootAtom, store)).connect();

    backend.receive({ count: 50, label: "a" });

    expect(store.get(rootAtom)).toEqual({ count: 10, label: "a" });
    expect(backend.read()).toEqual({ count: 10, label: "a" });
  });

  it("stops both directions after disconnect", () => {
    const counterAtom = atom<Counter>({ count: 0, label: "a" });
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(
      backend,
      createJotaiAdapter(counterAtom, store),
    );
    engine.connect();

    engine.disconnect();
    store.set(counterAtom, { count: 1, label: "a" });
    expect(backend.read()).toEqual({ count: 0, label: "a" });

    backend.receive({ count: 9, label: "a" });
    expect(store.get(counterAtom).count).toBe(1);
  });
});

type Todo = { id: string; title: string };
type FilterStatus = "all" | "active" | "completed";

const todoAtoms = () => ({
  todos: atom<Todo[]>([]),
  searchTerm: atom(""),
  filterStatus: atom<FilterStatus>("all"),
});

describe("JotaiAdapter of a record of atoms", () => {
  it("infers the synced state from the atoms", () => {
    const adapter = createJotaiAdapter(todoAtoms(), createStore());

    expectTypeOf(adapter.getState()).toEqualTypeOf<{
      todos: Todo[];
      searchTerm: string;
      filterStatus: FilterStatus;
    }>();
    expect(adapter.getState()).toEqual({
      todos: [],
      searchTerm: "",
      filterStatus: "all",
    });
  });

  it("infers the value types of utility and derived atoms, and rejects atoms it cannot write", () => {
    const todos = atom<Todo[]>([]);
    const adapter = createJotaiAdapter({
      draft: atomWithReset({ title: "" }),
      theme: atomWithStorage<"light" | "dark">("theme", "light"),
      selectedId: atom<string>(),
      count: atom(
        (get) => get(todos).length,
        (get, set, count: number) => set(todos, get(todos).slice(0, count)),
      ),
    });
    expectTypeOf(adapter.getState()).toEqualTypeOf<{
      draft: { title: string };
      theme: "light" | "dark";
      selectedId: string | undefined;
      count: number;
    }>();

    const readOnly = atom((get) => get(todos).length);
    const writeOnly = atom(null, (get, set, title: string) =>
      set(todos, [...get(todos), { id: title, title }]),
    );
    const writesAnother = atom(
      (get) => get(todos).length,
      (get, set, id: string) =>
        set(
          todos,
          get(todos).filter((todo) => todo.id !== id),
        ),
    );
    // @ts-expect-error A read-only atom cannot take a remote value.
    createJotaiAdapter({ todos, readOnly });
    // @ts-expect-error A write-only atom holds no value to sync.
    createJotaiAdapter({ todos, writeOnly });
    // @ts-expect-error The atom's write does not take its own value.
    createJotaiAdapter({ todos, writesAnother });
    // @ts-expect-error Every value must be an atom.
    createJotaiAdapter({ todos, count: 0 });
  });

  it("seeds the backend, writes atom changes, and applies remote changes", () => {
    const atoms = todoAtoms();
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(atoms, store)).connect();
    expect(backend.read()).toEqual({
      todos: [],
      searchTerm: "",
      filterStatus: "all",
    });

    store.set(atoms.searchTerm, "milk");
    expect(backend.read()).toEqual({
      todos: [],
      searchTerm: "milk",
      filterStatus: "all",
    });

    const milk = { id: "1", title: "Milk" };
    backend.receive({ todos: [milk], searchTerm: "", filterStatus: "active" });
    expect(store.get(atoms.todos)).toEqual([milk]);
    expect(store.get(atoms.searchTerm)).toBe("");
    expect(store.get(atoms.filterStatus)).toBe("active");
  });

  it("applies a remote change to three atoms with one notification and no write back", () => {
    const atoms = todoAtoms();
    const store = createStore();
    const backend = createMemoryBackend();
    const adapter = createJotaiAdapter(atoms, store);
    createSyncEngine(backend, adapter).connect();
    const notified = vi.fn();
    adapter.subscribe(notified);
    const write = vi.spyOn(backend, "write");

    const milk = { id: "1", title: "Milk" };
    backend.receive({
      todos: [milk],
      searchTerm: "mi",
      filterStatus: "active",
    });

    expect(notified).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    expect(adapter.getState()).toEqual({
      todos: [milk],
      searchTerm: "mi",
      filterStatus: "active",
    });
  });

  it("leaves the atoms a remote change does not touch alone", () => {
    const todosBase = atom<Todo[]>([{ id: "1", title: "Milk" }]);
    // Copies what it is given, so a write of the same list still changes the atom.
    const todos = atom(
      (get) => get(todosBase),
      (_get, set, next: Todo[]) => set(todosBase, [...next]),
    );
    const atoms = { ...todoAtoms(), todos };
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(atoms, store)).connect();
    const before = store.get(todos);
    const notified = { todos: vi.fn(), filterStatus: vi.fn() };
    store.sub(todos, notified.todos);
    store.sub(atoms.filterStatus, notified.filterStatus);

    backend.receive({ ...backend.read(), searchTerm: "milk" });

    expect(store.get(atoms.searchTerm)).toBe("milk");
    expect(store.get(todos)).toBe(before);
    expect(notified.todos).not.toHaveBeenCalled();
    expect(notified.filterStatus).not.toHaveBeenCalled();
  });

  it("resets an atom whose key a peer removes to its initial value, and writes it back", () => {
    const atoms = todoAtoms();
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(atoms, store)).connect();
    store.set(atoms.searchTerm, "milk");

    backend.receive({ todos: [], filterStatus: "active" });

    expect(store.get(atoms.searchTerm)).toBe("");
    expect(store.get(atoms.filterStatus)).toBe("active");
    expect(backend.read()).toEqual({
      todos: [],
      searchTerm: "",
      filterStatus: "active",
    });
  });

  it("keeps a key a peer removes absent when its atom starts undefined", () => {
    const selectedId = atom<string>();
    const atoms = { ...todoAtoms(), selectedId };
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(atoms, store)).connect();
    store.set(selectedId, "1");
    expect(backend.read()).toMatchObject({ selectedId: "1" });
    const write = vi.spyOn(backend, "write");

    backend.receive({ todos: [], searchTerm: "", filterStatus: "all" });

    expect(store.get(selectedId)).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    expect(backend.read()).toEqual({
      todos: [],
      searchTerm: "",
      filterStatus: "all",
    });
  });

  it("keeps the value of an atom without an initial value whose key a peer removes, and writes it back", () => {
    const termBase = atom("");
    // A derived writable atom has no initial value to reset to.
    const searchTerm = atom(
      (get) => get(termBase),
      (_get, set, next: string) => set(termBase, next.trimStart()),
    );
    const atoms = { ...todoAtoms(), searchTerm };
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(atoms, store)).connect();
    store.set(searchTerm, "milk");

    backend.receive({ todos: [], filterStatus: "active" });

    expect(store.get(searchTerm)).toBe("milk");
    expect(backend.read()).toEqual({
      todos: [],
      searchTerm: "milk",
      filterStatus: "active",
    });
  });

  it("removes a key a peer syncs outside the record on the next write without keys", () => {
    const atoms = todoAtoms();
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(backend, createJotaiAdapter(atoms, store)).connect();

    backend.receive({ ...backend.read(), theme: "dark" });
    store.set(atoms.filterStatus, "active");

    expect(backend.read()).toEqual({
      todos: [],
      searchTerm: "",
      filterStatus: "active",
    });
  });

  it("resets an atomWithReset atom whose key a peer removes", () => {
    const draft = atomWithReset({ title: "" });
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine(
      backend,
      createJotaiAdapter({ ...todoAtoms(), draft }, store),
    ).connect();
    store.set(draft, { title: "Milk" });

    backend.receive({ todos: [], searchTerm: "", filterStatus: "all" });

    expect(store.get(draft)).toEqual({ title: "" });
    expect(backend.read()).toMatchObject({ draft: { title: "" } });
  });

  it("uses the default store when none is given", () => {
    const atoms = todoAtoms();
    const backend = createMemoryBackend();

    createSyncEngine(backend, createJotaiAdapter(atoms)).connect();
    getDefaultStore().set(atoms.searchTerm, "milk");

    expect(backend.read()).toMatchObject({ searchTerm: "milk" });
  });

  it("stops both directions after disconnect", () => {
    const atoms = todoAtoms();
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createJotaiAdapter(atoms, store));
    engine.connect();

    engine.disconnect();
    store.set(atoms.searchTerm, "milk");
    expect(backend.read()).toMatchObject({ searchTerm: "" });

    backend.receive({ todos: [], searchTerm: "eggs", filterStatus: "all" });
    expect(store.get(atoms.searchTerm)).toBe("milk");
  });
});
