import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { makeAutoObservable, observable, runInAction } from "mobx";
import type { SyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { syncMobxStore, type SyncMobxStoreOptions } from "../index.js";

interface Todo {
  id: string;
  title: string;
}

class TodoStore {
  todos: Todo[] = [];
  filter = "all";
  draft = "";

  constructor() {
    makeAutoObservable(this);
  }

  get count(): number {
    return this.todos.length;
  }

  add(title: string): void {
    this.todos.push({ id: String(this.todos.length + 1), title });
  }
}

const milk: Todo = { id: "1", title: "Milk" };

describe("syncMobxStore", () => {
  it("connects by default, seeds an empty room and syncs in both directions", () => {
    const backend = createMemoryBackend();
    const store = new TodoStore();

    const engine = syncMobxStore(store, { backend });

    expect(engine.isConnected()).toBe(true);
    expect(backend.read()).toEqual({ todos: [], filter: "all", draft: "" });

    store.add("Milk");
    expect(backend.read()).toEqual({
      todos: [milk],
      filter: "all",
      draft: "",
    });

    backend.receive({ todos: [milk], filter: "done", draft: "" });
    expect(store.filter).toBe("done");
  });

  it("adopts what the room holds before it returns", () => {
    const store = new TodoStore();

    syncMobxStore(store, {
      backend: createMemoryBackend({ todos: [milk], filter: "done" }),
    });

    expect(store.todos).toEqual([milk]);
    expect(store.filter).toBe("done");
  });

  it("touches neither side's state until connect() with the manual connect mode", () => {
    const backend = createMemoryBackend({ todos: [milk] });
    const calls = ["read", "write", "subscribe"] as const;
    const spies = calls.map((method) => vi.spyOn(backend, method));
    const store = new TodoStore();

    const engine = syncMobxStore(store, { backend, connect: "manual" });
    runInAction(() => {
      store.filter = "done";
    });

    expect(engine.isConnected()).toBe(false);
    expect(store.todos).toEqual([]);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);

    engine.connect();
    expect(engine.isConnected()).toBe(true);
    expect(store.todos).toEqual([milk]);
    expect(backend.read()).toEqual({
      todos: [milk],
      filter: "done",
      draft: "",
    });
  });

  it("stops syncing on disconnect() and syncs again on connect()", () => {
    const backend = createMemoryBackend();
    const store = new TodoStore();
    const engine = syncMobxStore(store, { backend });

    engine.disconnect();
    store.add("Milk");
    backend.receive({ todos: [], filter: "done", draft: "" });

    expect(engine.isConnected()).toBe(false);
    expect(backend.read()).toEqual({ todos: [], filter: "done", draft: "" });
    expect(store.todos).toEqual([milk]);
    expect(store.filter).toBe("all");

    engine.connect();
    expect(engine.isConnected()).toBe(true);
    expect(store.todos).toEqual([]);
    expect(store.filter).toBe("done");

    store.add("Milk");
    expect(backend.read()).toEqual({
      todos: [milk],
      filter: "done",
      draft: "",
    });
  });

  it("syncs only the fields keys lists", () => {
    const backend = createMemoryBackend();
    const store = new TodoStore();

    syncMobxStore(store, { backend, keys: ["todos"] });
    runInAction(() => {
      store.filter = "done";
    });
    store.add("Milk");

    expect(backend.read()).toEqual({ todos: [milk] });
  });

  it("keeps the fields omit names local", () => {
    const backend = createMemoryBackend();
    const store = new TodoStore();

    syncMobxStore(store, { backend, omit: ["draft"] });
    runInAction(() => {
      store.draft = "Bread";
    });
    store.add("Milk");

    expect(backend.read()).toEqual({ todos: [milk], filter: "all" });
  });

  it("passes the sync engine's config to the engine", () => {
    const backend = createMemoryBackend({ todos: [milk] });
    const store = new TodoStore();

    syncMobxStore(store, {
      backend,
      seed: "never",
      filter: (key) => key !== "filter",
    });
    expect(backend.read()).toEqual({ todos: [milk] });

    runInAction(() => {
      store.draft = "Bread";
    });
    expect(backend.read()).toEqual({ todos: [milk], draft: "Bread" });
  });

  it("coalesces remote changes with the engine's schedule", () => {
    const backend = createMemoryBackend();
    const store = new TodoStore();
    const flushes: (() => void)[] = [];

    syncMobxStore(store, {
      backend,
      schedule: (flush) => flushes.push(flush),
    });
    backend.receive({ todos: [], filter: "done", draft: "" });
    expect(store.filter).toBe("all");

    flushes.forEach((flush) => flush());
    expect(store.filter).toBe("done");
  });

  it("reports a failed write to onError instead of MobX logging it", () => {
    const backend = createMemoryBackend();
    const store = new TodoStore();
    const failure = new Error("write failed");
    const onError = vi.fn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    syncMobxStore(store, { backend, onError });
    vi.spyOn(backend, "write").mockImplementation(() => {
      throw failure;
    });
    store.add("Milk");

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, "backend");
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("removes a key the room holds outside the store's synced fields", () => {
    const backend = createMemoryBackend({ todos: [milk], newer: 1 });
    const store = new TodoStore();

    syncMobxStore(store, { backend, keys: ["todos"] });

    expect(backend.read()).toEqual({ todos: [milk] });
  });

  it("lists the store's fields when it is called unless keys names them, with the manual connect mode too", () => {
    const backend = createMemoryBackend();
    const store = observable<Record<string, unknown>>({ title: "Week" });

    const engine = syncMobxStore(store, { backend, connect: "manual" });
    runInAction(() => {
      store.added = "too late";
    });
    engine.connect();

    expect(backend.read()).toEqual({ title: "Week" });
    expect(() =>
      syncMobxStore({ title: "plain" }, { backend, connect: "manual" }),
    ).toThrow();
    expect(() =>
      syncMobxStore(
        { title: "plain" },
        { backend, connect: "manual", keys: ["title"] },
      ),
    ).not.toThrow();
  });

  describe("types", () => {
    const store = new TodoStore();
    /** Types are what these tests check, so nothing here needs to connect. */
    const manual = {
      backend: createMemoryBackend(),
      connect: "manual",
    } as const;

    it("returns the engine and nothing more", () => {
      expectTypeOf(syncMobxStore(store, manual)).toEqualTypeOf<SyncEngine>();
    });

    it("infers the synced fields from keys, a shared tuple and omit", () => {
      const keys = ["todos", "filter"] as const;
      const omit = ["draft"] as const;
      type Listed = "todos" | "filter";

      syncMobxStore(store, {
        ...manual,
        keys: ["todos", "filter"],
        filter: (key) => {
          expectTypeOf(key).toEqualTypeOf<Listed>();
          return true;
        },
      });
      syncMobxStore(store, {
        ...manual,
        keys,
        filter: (key) => {
          expectTypeOf(key).toEqualTypeOf<Listed>();
          return true;
        },
      });
      syncMobxStore(store, {
        ...manual,
        omit,
        filter: (key) => {
          expectTypeOf(key).toEqualTypeOf<Listed | "count">();
          return true;
        },
      });
    });

    it("accepts a filter that takes any string with keys or omit", () => {
      const anyKey = (key: string): boolean => key !== "draft";

      syncMobxStore(store, { ...manual, keys: ["todos"], filter: anyKey });
      syncMobxStore(store, { ...manual, omit: ["draft"], filter: anyKey });
    });

    it("rejects method names, unknown names and keys with omit", () => {
      // @ts-expect-error `add` is a method, not data
      syncMobxStore(store, { ...manual, keys: ["todos", "add"] });
      // @ts-expect-error `todo` is not a field of the store
      syncMobxStore(store, { ...manual, keys: ["todo"] });
      // @ts-expect-error `add` is a method, not data
      syncMobxStore(store, { ...manual, omit: ["add"] });
      // @ts-expect-error `keys` and `omit` do not combine
      syncMobxStore(store, { ...manual, keys: ["todos"], omit: ["draft"] });
    });

    it("takes a connect mode, not a boolean", () => {
      expectTypeOf<SyncMobxStoreOptions<TodoStore>>()
        .toHaveProperty("connect")
        .toEqualTypeOf<"auto" | "manual" | undefined>();

      // @ts-expect-error `connect` takes a mode
      syncMobxStore(store, { ...manual, connect: true });
      // @ts-expect-error `connect` takes a mode
      syncMobxStore(store, { ...manual, connect: false });
    });

    it("takes the backend in the options, where it is required", () => {
      const { backend } = manual;

      expect(() =>
        // @ts-expect-error the backend is required
        syncMobxStore(store, { keys: ["todos"] }),
      ).toThrow(TypeError);
      expect(() =>
        // @ts-expect-error the backend goes in the options
        syncMobxStore(store, backend, { omit: ["draft"] }),
      ).toThrow(TypeError);
    });
  });
});
