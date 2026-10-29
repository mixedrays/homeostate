import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPersistence,
  createSyncEngine,
  type Persistence,
  type PersistenceAdapter,
} from "@homeostate/core";
import { prototypeMemberKeys } from "@homeostate/core/conformance";
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

  it("keeps the last backend document and stops comparing keys when reads fail, then recovers", async () => {
    const store = createTestStore({ count: 0, draft: "local" });
    const backend = createMemoryBackend();
    backend.receive({ count: 0 });
    let fail = false;
    inspector = createInspector({
      name: "counter",
      adapter: store.adapter,
      // Disconnected, so the store keeps its values; it still says which keys are local.
      engine: createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "draft",
      }),
      backend: {
        ...backend,
        read: () => {
          if (fail) throw new Error("backend unavailable");
          return backend.read();
        },
      },
    });
    inspector.start();
    await tick();
    const previous = inspector.getSnapshot().backend;

    fail = true;
    backend.receive({ count: 1 });
    await tick();
    expect(inspector.getSnapshot().backend).toBe(previous);
    expect(inspector.getSnapshot().backendError).toBe("backend unavailable");
    expect(inspector.getSnapshot().keyStatus).toEqual({ draft: "local" });

    fail = false;
    backend.receive({ count: 2 });
    await tick();
    expect(inspector.getSnapshot().backendError).toBeNull();
    expect(inspector.getSnapshot().backend).toEqual({ count: 2 });
    expect(inspector.getSnapshot().keyStatus).toEqual({
      count: "diverged",
      draft: "local",
    });
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
    expect((backend.read() as unknown as State).todos[0].done).toBe(true);
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
    expect((backend.read() as unknown as State).filter).toBe("all");
    expect(inspector.getSnapshot().log.at(-1)?.label).toBe("Restored #0");
  });

  it("keeps the identity of every other todo when a restore inserts one at the top", async () => {
    const { store, inspector } = setup();
    const first = { title: "first", done: false };
    store.set({ ...store.get(), todos: [first, ...store.get().todos] });
    await tick();
    const entry = inspector.getSnapshot().log.at(-1)!;
    const kept = store.get().todos.slice(1);
    store.set({ ...store.get(), todos: kept });
    await tick();

    inspector.restore(entry.id);
    await tick();

    expect(store.get().todos).toEqual([first, ...kept]);
    expect(store.get().todos[1]).toBe(kept[0]);
  });

  it.each(prototypeMemberKeys)(
    "removes a %s key missing from a replacement",
    (key) => {
      const store = createTestStore<Record<string, unknown>>({
        [key]: "x",
        count: 1,
      });
      inspector = createInspector({ name: "keys", adapter: store.adapter });

      inspector.replaceState({ count: 2 }, "Replaced");

      expect(store.get()).toEqual({ count: 2 });
    },
  );

  it.each(prototypeMemberKeys)(
    "compares a %s key with the backend's own key only",
    (key) => {
      const status = (store: object, backend: object) => {
        const source = createInspector({
          name: "keys",
          adapter: createTestStore(store).adapter,
          backend: createMemoryBackend(backend),
        });
        return source.getSnapshot().keyStatus;
      };

      expect(status({ [key]: "x" }, {})).toEqual({ [key]: "pending" });
      expect(status({ [key]: "x" }, { [key]: "x" })).toEqual({
        [key]: "synced",
      });
      expect(status({ [key]: "x" }, { [key]: "y" })).toEqual({
        [key]: "diverged",
      });
      expect(status({}, { [key]: "x" })).toEqual({ [key]: "backend-only" });
    },
  );

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
      engine: createSyncEngine(createMemoryBackend(), store.adapter, {
        filter: (key) => key !== "cache",
      }),
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

describe("sync events", () => {
  /** A scheduler that holds each flush until the test runs it. */
  const manualScheduler = () => {
    const queued: (() => void)[] = [];
    return {
      schedule: (flush: () => void) => {
        queued.push(flush);
      },
      run: () => queued.splice(0).forEach((flush) => flush()),
    };
  };

  const remoteChange = { ...initial(), filter: "active" };

  it("logs a remote change applied by a flush run later as remote", async () => {
    const store = createTestStore<State>(initial());
    const backend = createMemoryBackend();
    const scheduler = manualScheduler();
    const engine = createSyncEngine(backend, store.adapter, {
      schedule: scheduler.schedule,
    });
    engine.connect();
    inspector = createInspector({
      name: "todos",
      adapter: store.adapter,
      backend,
      engine,
    });
    inspector.start();
    await tick();

    backend.receive(remoteChange);
    await tick();
    expect(inspector.getSnapshot().backend?.filter).toBe("active");
    expect(inspector.getSnapshot().log).toHaveLength(1);

    scheduler.run();
    await tick();
    expect(inspector.getSnapshot().log.at(-1)).toMatchObject({
      origin: "remote",
      state: { filter: "active" },
    });
  });

  it.each([
    ["the engine", true],
    ["the inspector", false],
  ])(
    "logs a remote change applied in a microtask as remote when %s subscribed to the backend first",
    async (_, engineFirst) => {
      const store = createTestStore<State>(initial());
      const backend = createMemoryBackend();
      const engine = createSyncEngine(backend, store.adapter, {
        schedule: (flush) => queueMicrotask(flush),
      });
      if (engineFirst) engine.connect();
      inspector = createInspector({
        name: "todos",
        adapter: store.adapter,
        backend,
        engine,
      });
      inspector.start();
      if (!engineFirst) engine.connect();
      await tick();

      backend.receive(remoteChange);
      await tick();

      const { log, store: state } = inspector.getSnapshot();
      expect(state.filter).toBe("active");
      expect(log.at(-1)?.origin).toBe("remote");
    },
  );

  it("updates the connection status when the app connects or disconnects the engine", async () => {
    const { engine, inspector } = setup();

    engine.disconnect();
    await tick();
    expect(inspector.getSnapshot().connected).toBe(false);

    engine.connect();
    await tick();
    expect(inspector.getSnapshot().connected).toBe(true);
  });

  it("logs a connect made by the app as adopting the backend", async () => {
    const { store, engine, inspector } = setup();
    engine.disconnect();
    store.set({ ...store.get(), filter: "done" });
    await tick();

    engine.connect();
    await tick();

    expect(store.get().filter).toBe("all");
    expect(inspector.getSnapshot().log.at(-1)).toMatchObject({
      origin: "remote",
      label: "Connected: adopted the backend",
    });
  });

  it("stops hearing the engine after stop()", async () => {
    const { engine, inspector } = setup();
    inspector.stop();
    engine.disconnect();
    await tick();
    expect(inspector.getSnapshot().connected).toBe(true);
  });

  it("marks keys and flags values as before for a source without an engine", async () => {
    const store = createTestStore<Record<string, unknown>>({
      count: 0,
      draft: "x",
      when: new Date(0),
      add: () => {},
    });
    const backend = createMemoryBackend();
    backend.receive({ count: 0, gone: true });
    inspector = createInspector({
      name: "plain",
      adapter: store.adapter,
      backend,
    });
    inspector.start();
    await tick();

    const snapshot = inspector.getSnapshot();
    expect(snapshot.connected).toBeNull();
    expect(snapshot.keyStatus).toEqual({
      count: "synced",
      draft: "pending",
      when: "pending",
      gone: "backend-only",
    });
    expect(snapshot.warnings).toEqual([{ path: ["when"], kind: "Date" }]);
  });
});

describe("storage", () => {
  const setupStorage = async (
    wrap: (persistence: Persistence) => Persistence = (p) => p,
    adapt: (storage: PersistenceAdapter) => PersistenceAdapter = (s) => s,
  ) => {
    const store = createTestStore({ count: 0 });
    const doc = createTestDoc();
    const storage = createMemoryPersistenceAdapter();
    const persistence = createPersistence(doc, adapt(storage), {
      key: "doc",
      onError: () => {},
    });
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
      operationError: null,
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
      operationError: null,
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

  it.each(["compact", "clear"] as const)(
    "keeps a failed %s visible after refreshing stats and clears it on retry",
    async (operation) => {
      let fail = (): void => {};
      const { inspector, persistence, storage } = await setupStorage(
        (persistence) => persistence,
        (memory) => {
          const call = vi.fn(memory[operation]);
          fail = () => {
            call.mockRejectedValueOnce(new Error(`${operation} failed`));
          };
          return { ...memory, [operation]: call };
        },
      );
      await persistence.flush();
      fail();
      const change =
        operation === "compact"
          ? inspector.compactStorage
          : inspector.clearStorage;
      await change();
      await inspector.refreshStorage();

      expect(inspector.getSnapshot().storage).toMatchObject({
        busy: null,
        operationError: `${operation} failed`,
        error: null,
        stats: { updates: 1 },
        cleared: false,
      });
      await change();
      expect(inspector.getSnapshot().storage?.operationError).toBeNull();
      expect(storage.size("doc")).toBe(operation === "clear" ? 0 : 1);
    },
  );
});
