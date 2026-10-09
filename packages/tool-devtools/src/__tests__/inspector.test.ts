import { afterEach, describe, expect, it } from "vitest";
import {
  createPersistence,
  createSyncEngine,
  type Persistence,
} from "@homeostate/core";
import {
  createMemoryBackend,
  createMemoryPersistenceAdapter,
} from "@homeostate/core/testing";
import { createInspector, type Inspector } from "../inspector";
import { createTestDoc, createTestStore, tick } from "./helpers";

interface State {
  todos: { title: string; done: boolean }[];
  filter: string;
  draft?: string;
  add?: () => void;
}

const initial = (): State => ({
  todos: [{ title: "a", done: false }],
  filter: "all",
});

let inspector: Inspector | undefined;

afterEach(() => {
  inspector?.stop();
  inspector = undefined;
});

const setup = (options: { filter?: (key: string) => boolean } = {}) => {
  const store = createTestStore<State>(initial());
  const backend = createMemoryBackend();
  const engine = createSyncEngine(backend, store.adapter, {
    filter: options.filter,
  });
  engine.connect();
  inspector = createInspector({
    name: "todos",
    adapter: store.adapter,
    backend,
    engine,
    filter: options.filter,
  });
  inspector.start();
  return { store, backend, engine, inspector };
};

describe("createInspector", () => {
  it("starts with the store, the backend and an initial log entry", () => {
    const { inspector } = setup();
    const snapshot = inspector.getSnapshot();
    expect(snapshot.store).toEqual(initial());
    expect(snapshot.backend).toEqual(initial());
    expect(snapshot.connected).toBe(true);
    expect(snapshot.log).toMatchObject([{ id: 0, origin: "initial" }]);
    expect(snapshot.keyStatus).toEqual({ todos: "synced", filter: "synced" });
  });

  it("logs a local change with its diff", async () => {
    const { store, inspector } = setup();
    store.set({ ...store.get(), filter: "done" });
    await tick();

    const entry = inspector.getSnapshot().log.at(-1);
    expect(entry).toMatchObject({
      origin: "local",
      diff: [
        { kind: "update", path: ["filter"], before: "all", after: "done" },
      ],
    });
    expect(inspector.getSnapshot().backend?.filter).toBe("done");
  });

  it("logs a change from a peer once, as remote", async () => {
    const { backend, inspector } = setup();
    backend.receive({ ...initial(), filter: "active" });
    await tick();

    const { log, store } = inspector.getSnapshot();
    expect(store.filter).toBe("active");
    expect(log).toHaveLength(2);
    expect(log[1].origin).toBe("remote");
  });

  it("writes an edit through the adapter, so the engine syncs it", async () => {
    const { store, backend, inspector } = setup();
    inspector.setAt(["todos", 0, "done"], true, "Edited todos[0].done");
    await tick();

    expect(store.get().todos[0].done).toBe(true);
    expect((backend.read() as State).todos[0].done).toBe(true);
    expect(inspector.getSnapshot().log.at(-1)).toMatchObject({
      origin: "devtools",
      label: "Edited todos[0].done",
    });
  });

  it("keeps actions and unchanged subtrees when replacing the state", async () => {
    const { store, inspector } = setup();
    const add = () => {};
    store.set({ ...store.get(), add });
    const todos = store.get().todos;

    inspector.replaceState(
      { todos: [{ title: "a", done: false }], filter: "done" },
      "Replaced",
    );
    await tick();

    expect(store.get().add).toBe(add);
    expect(store.get().todos).toBe(todos);
    expect(store.get().filter).toBe("done");
  });

  it("removes JSON keys missing from a replacement", async () => {
    const { store, inspector } = setup();
    store.set({ ...store.get(), draft: "x" });
    inspector.replaceState(initial() as never, "Replaced");
    await tick();
    expect("draft" in store.get()).toBe(false);
  });

  it("restores a logged state and syncs it", async () => {
    const { store, backend, inspector } = setup();
    store.set({ ...store.get(), filter: "done" });
    await tick();

    inspector.restore(0);
    await tick();

    expect(store.get().filter).toBe("all");
    expect((backend.read() as State).filter).toBe("all");
    expect(inspector.getSnapshot().log.at(-1)?.label).toBe("Restored #0");
  });

  it("marks filtered keys local and unsynced edits while disconnected", async () => {
    const { store, inspector } = setup({ filter: (key) => key !== "draft" });
    store.set({ ...store.get(), draft: "hi" });
    await tick();
    expect(inspector.getSnapshot().keyStatus.draft).toBe("local");

    inspector.disconnect();
    store.set({ ...store.get(), filter: "done" });
    await tick();

    const snapshot = inspector.getSnapshot();
    expect(snapshot.connected).toBe(false);
    expect(snapshot.keyStatus.filter).toBe("diverged");
  });

  it("reconnects, adopting the backend", async () => {
    const { store, inspector } = setup();
    inspector.disconnect();
    store.set({ ...store.get(), filter: "done" });
    await tick();

    inspector.connect();
    await tick();

    expect(store.get().filter).toBe("all");
    expect(inspector.getSnapshot()).toMatchObject({
      connected: true,
      keyStatus: { filter: "synced" },
    });
    expect(inspector.getSnapshot().log.at(-1)?.origin).toBe("remote");
  });

  it("skips logging while paused, and clears the log", async () => {
    const { store, inspector } = setup();
    inspector.setPaused(true);
    store.set({ ...store.get(), filter: "done" });
    await tick();
    expect(inspector.getSnapshot().log).toHaveLength(1);
    expect(inspector.getSnapshot().store.filter).toBe("done");

    inspector.clearLog();
    expect(inspector.getSnapshot().log).toHaveLength(0);
  });

  it("keeps at most logLimit entries", async () => {
    const store = createTestStore({ count: 0 });
    inspector = createInspector(
      { name: "count", adapter: store.adapter },
      { logLimit: 3 },
    );
    inspector.start();
    for (let count = 1; count <= 5; count++) {
      store.set({ count });
      await tick();
    }
    expect(inspector.getSnapshot().log.map((entry) => entry.id)).toEqual([
      3, 4, 5,
    ]);
    expect(inspector.getSnapshot().backend).toBeNull();
    expect(inspector.getSnapshot().connected).toBeNull();
    expect(inspector.getSnapshot().storage).toBeNull();
  });

  it("stops watching after stop()", async () => {
    const { store, inspector } = setup();
    inspector.stop();
    store.set({ ...store.get(), filter: "done" });
    await tick();
    expect(inspector.getSnapshot().store.filter).toBe("all");
  });

  it("flags values in synced keys that are not JSON, but not in local keys", async () => {
    const store = createTestStore<Record<string, unknown>>({
      when: new Date(0),
      cache: new Map(),
    });
    inspector = createInspector({
      name: "dates",
      adapter: store.adapter,
      filter: (key) => key !== "cache",
    });
    inspector.start();
    expect(inspector.getSnapshot().warnings).toEqual([
      { path: ["when"], kind: "Date" },
    ]);

    store.set({ when: "1970-01-01", cache: new Map() });
    await tick();
    expect(inspector.getSnapshot().warnings).toEqual([]);
  });

  it("flags a BigInt the JSON view cannot read", () => {
    const store = createTestStore({ total: 1n });
    inspector = createInspector({ name: "total", adapter: store.adapter });
    const snapshot = inspector.getSnapshot();
    expect(snapshot.storeError).toMatch(/BigInt/);
    expect(snapshot.warnings).toEqual([{ path: ["total"], kind: "BigInt" }]);
  });

  it("replaces the log with imported entries and numbers new ones after them", async () => {
    const { store, inspector } = setup();
    inspector.importLog([
      {
        id: 7,
        at: 1,
        origin: "local",
        state: { todos: [{ title: "a", done: false }], filter: "imported" },
        diff: [],
      },
    ]);
    expect(inspector.getSnapshot().log).toMatchObject([
      { id: 7, imported: true },
    ]);

    store.set({ ...store.get(), filter: "done" });
    await tick();
    expect(inspector.getSnapshot().log.map(({ id }) => id)).toEqual([7, 8]);

    inspector.restore(7);
    await tick();
    expect(store.get().filter).toBe("imported");
  });
});

describe("storage", () => {
  const setupStorage = async (
    wrap: (persistence: Persistence) => Persistence = (p) => p,
  ) => {
    const store = createTestStore({ count: 0 });
    const doc = createTestDoc();
    const storage = createMemoryPersistenceAdapter();
    const persistence = createPersistence(doc, storage, { key: "doc" });
    await persistence.whenLoaded;
    inspector = createInspector({
      name: "count",
      adapter: store.adapter,
      persistence: wrap(persistence),
    });
    return { doc, storage, persistence, inspector };
  };

  it("reads what is stored", async () => {
    const { doc, inspector } = await setupStorage();
    expect(inspector.getSnapshot().storage).toEqual({
      stats: null,
      busy: null,
      cleared: false,
      error: null,
    });

    doc.add("a");
    doc.add("b");
    await inspector.refreshStorage();

    expect(inspector.getSnapshot().storage?.stats?.updates).toBe(3);
  });

  it("reads again after a read in progress when asked meanwhile", async () => {
    const { doc, inspector } = await setupStorage();
    const first = inspector.refreshStorage();
    doc.add("a");
    await inspector.refreshStorage();
    await first;

    expect(inspector.getSnapshot().storage?.stats?.updates).toBe(2);
  });

  it("compacts the stored log", async () => {
    const { doc, storage, inspector } = await setupStorage();
    doc.add("a");
    doc.add("b");

    await inspector.compactStorage();

    expect(storage.size("doc")).toBe(1);
    expect(inspector.getSnapshot().storage).toMatchObject({
      stats: { updates: 1 },
      busy: null,
    });
  });

  it("clears storage and stops storing", async () => {
    const { doc, storage, persistence, inspector } = await setupStorage();
    doc.add("a");

    await inspector.clearStorage();
    doc.add("b");
    await persistence.flush();

    expect(storage.size("doc")).toBe(0);
    expect(inspector.getSnapshot().storage).toEqual({
      stats: { updates: 0, bytes: 0 },
      busy: null,
      cleared: true,
      error: null,
    });
  });

  it("reports a read that fails", async () => {
    const { inspector } = await setupStorage((persistence) => ({
      ...persistence,
      stats: () => Promise.reject(new Error("storage unavailable")),
    }));

    await inspector.refreshStorage();

    expect(inspector.getSnapshot().storage?.error).toBe("storage unavailable");
  });
});
