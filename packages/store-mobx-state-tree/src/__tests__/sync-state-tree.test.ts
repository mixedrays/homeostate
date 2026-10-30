import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import {
  addDisposer,
  applySnapshot,
  destroy,
  detach,
  getSnapshot,
  isAlive,
  setLivelinessChecking,
  types,
  type Instance,
} from "mobx-state-tree";
import type { SyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { syncStateTree, type SyncStateTreeOptions } from "../index.js";

const Todo = types.model("Todo", {
  id: types.identifier,
  title: types.string,
  done: false,
});

const TodoStore = types
  .model("TodoStore", {
    todos: types.array(Todo),
    filter: "all",
  })
  .actions((self) => ({
    add(id: string, title: string) {
      self.todos.push({ id, title });
    },
    setFilter(filter: string) {
      self.filter = filter;
    },
  }));

const Counter = types.model("Counter", { count: 0 }).actions((self) => ({
  increment() {
    self.count++;
  },
}));

const Workspace = types
  .model("Workspace", { counter: types.maybe(Counter), name: "" })
  .actions((self) => ({
    place(counter: Instance<typeof Counter>) {
      self.counter = counter;
    },
    take() {
      return detach(self.counter!);
    },
    remove() {
      destroy(self.counter!);
    },
    replace() {
      self.counter = Counter.create({ count: 100 });
    },
    incrementAndRemove() {
      self.counter!.increment();
      destroy(self.counter!);
    },
  }));

const createWorkspace = () => {
  const workspace = Workspace.create({ counter: { count: 1 } });
  return { workspace, counter: workspace.counter! };
};

const milk = { id: "1", title: "Milk", done: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncStateTree", () => {
  it("connects by default, seeds an empty room and syncs in both directions", () => {
    const backend = createMemoryBackend();
    const store = TodoStore.create();

    const engine = syncStateTree(store, { backend });

    expect(engine.isConnected()).toBe(true);
    expect(backend.read()).toEqual({ todos: [], filter: "all" });

    store.add("1", "Milk");
    expect(backend.read()).toEqual({ todos: [milk], filter: "all" });

    backend.receive({ todos: [milk], filter: "done" });
    expect(getSnapshot(store)).toEqual({ todos: [milk], filter: "done" });
  });

  it("adopts what the room holds before it returns", () => {
    const store = TodoStore.create();

    syncStateTree(store, {
      backend: createMemoryBackend({ todos: [milk], filter: "done" }),
    });

    expect(getSnapshot(store)).toEqual({ todos: [milk], filter: "done" });
  });

  it("touches neither side until connect() with the manual connect mode", () => {
    const backend = createMemoryBackend({ todos: [milk] });
    const calls = ["read", "write", "subscribe"] as const;
    const spies = calls.map((method) => vi.spyOn(backend, method));
    const store = TodoStore.create();

    const engine = syncStateTree(store, { backend, connect: "manual" });
    store.setFilter("done");

    expect(engine.isConnected()).toBe(false);
    expect(getSnapshot(store).todos).toEqual([]);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);

    engine.connect();
    expect(engine.isConnected()).toBe(true);
    expect(backend.read()).toEqual({ todos: [milk], filter: "done" });
  });

  it("stops syncing on disconnect() and syncs again on connect()", () => {
    const backend = createMemoryBackend();
    const store = TodoStore.create();
    const engine = syncStateTree(store, { backend });

    engine.disconnect();
    store.add("1", "Milk");
    backend.receive({ todos: [], filter: "done" });

    expect(engine.isConnected()).toBe(false);
    expect(backend.read()).toEqual({ todos: [], filter: "done" });
    expect(getSnapshot(store)).toEqual({ todos: [milk], filter: "all" });

    engine.connect();
    expect(getSnapshot(store)).toEqual({ todos: [], filter: "done" });

    store.add("1", "Milk");
    expect(backend.read()).toEqual({ todos: [milk], filter: "done" });
  });

  it("passes the sync engine's config on", () => {
    const backend = createMemoryBackend({ filter: "done" });
    const store = TodoStore.create({ todos: [milk] });
    const flushes: (() => void)[] = [];

    syncStateTree(store, {
      backend,
      omit: ["todos"],
      schedule: (flush) => flushes.push(flush),
    });

    expect(backend.read()).toEqual({ filter: "done" });

    backend.receive({ filter: "all" });
    expect(getSnapshot(store).filter).toBe("done");

    flushes[0]();
    expect(getSnapshot(store)).toEqual({ todos: [milk], filter: "all" });
  });

  describe("destroying the node", () => {
    it("stops syncing, so a later remote change does not touch the node", () => {
      const warn = vi.spyOn(console, "warn");
      const backend = createMemoryBackend();
      const store = TodoStore.create();
      const engine = syncStateTree(store, { backend });

      destroy(store);

      expect(engine.isConnected()).toBe(false);
      backend.receive({ todos: [milk], filter: "done" });
      expect(getSnapshot(store)).toEqual({ todos: [], filter: "all" });
      expect(warn).not.toHaveBeenCalled();
    });

    it("leaves the room as it is", () => {
      const backend = createMemoryBackend();
      const store = TodoStore.create({ todos: [milk] });
      syncStateTree(store, { backend });
      const write = vi.spyOn(backend, "write");

      destroy(store);

      expect(write).not.toHaveBeenCalled();
      expect(backend.read()).toEqual({ todos: [milk], filter: "all" });
    });

    it("stops an engine reconnected before the destroy", () => {
      const store = TodoStore.create();
      const engine = syncStateTree(store, { backend: createMemoryBackend() });

      engine.disconnect();
      engine.connect();
      destroy(store);

      expect(engine.isConnected()).toBe(false);
    });

    it("is safe after disconnect(), and disconnect() is safe after it", () => {
      const store = TodoStore.create();
      const engine = syncStateTree(store, { backend: createMemoryBackend() });
      const events: string[] = [];
      engine.subscribe((event) => events.push(event));

      engine.disconnect();
      destroy(store);
      engine.disconnect();

      expect(events).toEqual(["disconnect"]);
      expect(isAlive(store)).toBe(false);
    });

    it("works when the app adds engine.disconnect as its own disposer", () => {
      const store = TodoStore.create();
      const engine = syncStateTree(store, { backend: createMemoryBackend() });

      addDisposer(store, engine.disconnect);
      destroy(store);

      expect(engine.isConnected()).toBe(false);
      expect(isAlive(store)).toBe(false);
    });

    describe.each(["warn", "error", "ignore"] as const)(
      "with MST liveliness checking set to %s",
      (mode) => {
        beforeEach(() => {
          setLivelinessChecking(mode);
        });

        afterEach(() => {
          setLivelinessChecking("warn");
        });

        it("throws from a later connect(), touching neither side", () => {
          const backend = createMemoryBackend();
          const store = TodoStore.create({ filter: "done" });
          const engine = syncStateTree(store, { backend, connect: "manual" });
          const calls = ["read", "write", "subscribe"] as const;
          const spies = calls.map((method) => vi.spyOn(backend, method));
          destroy(store);

          expect(() => engine.connect()).toThrow(/destroyed/);

          expect(engine.isConnected()).toBe(false);
          expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
        });

        it("throws from an automatic connect on a dead node, touching neither side", () => {
          const backend = createMemoryBackend();
          const store = TodoStore.create({ filter: "done" });
          const calls = ["read", "write", "subscribe"] as const;
          const spies = calls.map((method) => vi.spyOn(backend, method));
          destroy(store);

          expect(() => syncStateTree(store, { backend })).toThrow(/destroyed/);

          expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
        });
      },
    );

    it("returns the engine for a dead node in the manual connect mode, and connect() throws", () => {
      const store = TodoStore.create();
      destroy(store);

      const engine = syncStateTree(store, {
        backend: createMemoryBackend(),
        connect: "manual",
      });

      expect(engine.isConnected()).toBe(false);
      expect(() => engine.connect()).toThrow(/destroyed/);
    });

    it("refuses a listener that reconnects as the node is destroyed", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const store = TodoStore.create();
      const engine = syncStateTree(store, { backend: createMemoryBackend() });
      engine.subscribe((event) => {
        if (event === "disconnect") engine.connect();
      });

      destroy(store);

      expect(engine.isConnected()).toBe(false);
      expect(consoleError).toHaveBeenCalledOnce();
    });

    describe("with a remote change waiting for its scheduled apply", () => {
      const hookedStore = () => {
        const destroyed: string[] = [];
        const Item = types
          .model("Item", { id: types.identifier })
          .actions((self) => ({
            beforeDestroy() {
              destroyed.push(self.id);
            },
          }));
        const store = types
          .model("Items", { items: types.array(Item), label: "" })
          .create({ items: [{ id: "1" }, { id: "2" }] });
        // MST creates a child on first access, and only then runs its hooks.
        store.items.forEach((item) => item.id);
        return { store, destroyed };
      };

      it("does not apply it to the dying node", () => {
        const { store, destroyed } = hookedStore();
        const backend = createMemoryBackend();
        syncStateTree(store, { backend, schedule: () => {} });
        const remote = { items: [{ id: "2" }, { id: "3" }], label: "done" };
        backend.receive(remote);

        destroy(store);

        expect(destroyed).toEqual(["1", "2"]);
        expect(getSnapshot(store)).toEqual({
          items: [{ id: "1" }, { id: "2" }],
          label: "",
        });
      });

      it("leaves the remote change in the room", () => {
        const { store } = hookedStore();
        const backend = createMemoryBackend();
        syncStateTree(store, { backend, schedule: () => {} });
        const remote = { items: [{ id: "2" }], label: "done" };
        backend.receive(remote);
        const write = vi.spyOn(backend, "write");

        destroy(store);

        expect(write).not.toHaveBeenCalled();
        expect(backend.read()).toEqual(remote);
      });

      it("finishes destroying the node when the change is not a valid snapshot", () => {
        const store = TodoStore.create();
        const backend = createMemoryBackend();
        const earlierDisposer = vi.fn();
        addDisposer(store, earlierDisposer);
        const engine = syncStateTree(store, { backend, schedule: () => {} });
        backend.receive({ todos: "not a list", filter: 1 });

        destroy(store);

        expect(isAlive(store)).toBe(false);
        expect(engine.isConnected()).toBe(false);
        expect(earlierDisposer).toHaveBeenCalledOnce();
      });

      it("does nothing when the scheduled flush runs after the destroy", () => {
        const { store } = hookedStore();
        const backend = createMemoryBackend();
        const flushes: (() => void)[] = [];
        syncStateTree(store, {
          backend,
          schedule: (flush) => flushes.push(flush),
        });
        backend.receive({ items: [], label: "done" });
        destroy(store);

        flushes[0]();

        expect(getSnapshot(store).label).toBe("");
      });
    });
  });

  describe("writes in the batch of the destroy", () => {
    it("sends a change an earlier action made", () => {
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      syncStateTree(counter, { backend });

      counter.increment();
      workspace.remove();

      expect(backend.read()).toEqual({ count: 2 });
    });

    it("does not send a change made in the action that destroys the node", () => {
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      syncStateTree(counter, { backend });

      workspace.incrementAndRemove();

      expect(getSnapshot(counter)).toEqual({ count: 2 });
      expect(backend.read()).toEqual({ count: 1 });
    });

    it("does not send a change made in beforeDestroy", () => {
      const store = Counter.actions((self) => ({
        beforeDestroy() {
          self.count = 100;
        },
      })).create();
      const backend = createMemoryBackend();
      syncStateTree(store, { backend });

      destroy(store);

      expect(getSnapshot(store)).toEqual({ count: 100 });
      expect(backend.read()).toEqual({ count: 0 });
    });

    it("does not send a change made in a disposer, whichever was added first", () => {
      const store = Counter.create();
      const backend = createMemoryBackend();
      addDisposer(store, () => store.increment());
      syncStateTree(store, { backend });
      addDisposer(store, () => store.increment());

      destroy(store);

      expect(getSnapshot(store)).toEqual({ count: 2 });
      expect(backend.read()).toEqual({ count: 0 });
    });
  });

  describe("syncing a subtree", () => {
    it("syncs that node alone, in both directions", () => {
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();

      syncStateTree(counter, { backend });
      expect(backend.read()).toEqual({ count: 1 });

      counter.increment();
      expect(backend.read()).toEqual({ count: 2 });

      backend.receive({ count: 5 });
      expect(getSnapshot(workspace)).toEqual({
        counter: { count: 5 },
        name: "",
      });
    });

    it("stops when the root is destroyed", () => {
      const warn = vi.spyOn(console, "warn");
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      const engine = syncStateTree(counter, { backend });

      destroy(workspace);

      expect(engine.isConnected()).toBe(false);
      backend.receive({ count: 5 });
      expect(getSnapshot(counter)).toEqual({ count: 1 });
      expect(warn).not.toHaveBeenCalled();
    });

    it("stops when the subtree is destroyed, and keeps the parent's engine running", () => {
      const { workspace, counter } = createWorkspace();
      const parentBackend = createMemoryBackend();
      const parent = syncStateTree(workspace, { backend: parentBackend });
      const engine = syncStateTree(counter, { backend: createMemoryBackend() });

      workspace.remove();

      expect(engine.isConnected()).toBe(false);
      expect(parent.isConnected()).toBe(true);
      expect(parentBackend.read()).toEqual({ name: "" });
    });

    it("stops when a parent's action replaces the subtree", () => {
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      const engine = syncStateTree(counter, { backend });

      workspace.replace();

      expect(engine.isConnected()).toBe(false);
      expect(backend.read()).toEqual({ count: 1 });
    });

    it("keeps syncing when MST reconciles the subtree in place", () => {
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      const engine = syncStateTree(counter, { backend });

      applySnapshot(workspace, { counter: { count: 5 }, name: "" });

      expect(isAlive(counter)).toBe(true);
      expect(engine.isConnected()).toBe(true);
      expect(backend.read()).toEqual({ count: 5 });
    });

    it("syncs a map node", () => {
      const counters = types
        .model("Counters", { byName: types.map(Counter) })
        .create({ byName: { a: { count: 1 } } });
      const backend = createMemoryBackend();

      syncStateTree(counters.byName, { backend });
      backend.receive({ b: { count: 2 } });

      expect(getSnapshot(counters)).toEqual({
        byName: { b: { count: 2 } },
      });
    });

    it("rejects an array node, whose snapshot is no object, when it connects", () => {
      const store = TodoStore.create();

      expect(() =>
        syncStateTree(store.todos, { backend: createMemoryBackend() }),
      ).toThrow(TypeError);
    });
  });

  describe("detaching the node", () => {
    it("keeps it syncing in both directions", () => {
      const warn = vi.spyOn(console, "warn");
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      const engine = syncStateTree(counter, { backend });

      workspace.take();

      expect(engine.isConnected()).toBe(true);
      expect(isAlive(counter)).toBe(true);

      counter.increment();
      expect(backend.read()).toEqual({ count: 2 });

      backend.receive({ count: 5 });
      expect(getSnapshot(counter)).toEqual({ count: 5 });
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps it syncing once it is attached again", () => {
      const { workspace, counter } = createWorkspace();
      const backend = createMemoryBackend();
      syncStateTree(counter, { backend });

      workspace.take();
      workspace.place(counter);
      counter.increment();

      expect(backend.read()).toEqual({ count: 2 });
    });

    it("is not stopped by destroying the old parent", () => {
      const { workspace, counter } = createWorkspace();
      const engine = syncStateTree(counter, { backend: createMemoryBackend() });

      workspace.take();
      destroy(workspace);

      expect(engine.isConnected()).toBe(true);
    });

    it("stops when the detached node is destroyed", () => {
      const { workspace, counter } = createWorkspace();
      const engine = syncStateTree(counter, { backend: createMemoryBackend() });

      workspace.take();
      destroy(counter);

      expect(engine.isConnected()).toBe(false);
    });
  });

  describe("a key the room holds outside the model", () => {
    const local = { todos: [], filter: "all" };

    it("is removed at connect when the model's keys differ from the room's", () => {
      const backend = createMemoryBackend({
        todos: [],
        filter: "done",
        extra: 1,
      });

      syncStateTree(TodoStore.create(), { backend });

      expect(backend.read()).toEqual({ todos: [], filter: "done" });
    });

    it("stays at connect when the model's keys equal the room's, until a local change", () => {
      const backend = createMemoryBackend({ ...local, extra: 1 });
      const store = TodoStore.create();

      syncStateTree(store, { backend });
      expect(backend.read()).toEqual({ ...local, extra: 1 });

      store.setFilter("done");
      expect(backend.read()).toEqual({ todos: [], filter: "done" });
    });

    it("stays after a remote change that adds nothing else, until a local change", () => {
      const backend = createMemoryBackend(local);
      const store = TodoStore.create();
      syncStateTree(store, { backend });

      backend.receive({ ...local, extra: 1 });
      expect(backend.read()).toEqual({ ...local, extra: 1 });

      store.setFilter("done");
      expect(backend.read()).toEqual({ todos: [], filter: "done" });
    });

    it("is removed by a remote change that also changes a key of the model", () => {
      const backend = createMemoryBackend(local);
      syncStateTree(TodoStore.create(), { backend });

      backend.receive({ todos: [], filter: "done", extra: 1 });

      expect(backend.read()).toEqual({ todos: [], filter: "done" });
    });

    it.each([
      ["keys", { keys: ["todos", "filter"] }],
      ["a filter that drops it", { filter: (key: string) => key !== "extra" }],
    ] as const)(
      "stays through connect and remote changes with %s, until a local change",
      (_, config) => {
        const backend = createMemoryBackend({
          todos: [],
          filter: "done",
          extra: 1,
        });
        const store = TodoStore.create();
        syncStateTree(store, { backend, ...config });
        expect(backend.read()).toHaveProperty("extra", 1);

        backend.receive({ todos: [milk], filter: "done", extra: 1 });
        expect(backend.read()).toHaveProperty("extra", 1);

        store.add("2", "Bread");
        expect(backend.read()).not.toHaveProperty("extra");
      },
    );

    it("is removed with omit as without it, since omit leaves it synced", () => {
      const backend = createMemoryBackend({ todos: [milk], extra: 1 });

      syncStateTree(TodoStore.create(), { backend, omit: ["filter"] });

      expect(backend.read()).toEqual({ todos: [milk] });
    });
  });

  describe("types", () => {
    const store = TodoStore.create();
    const manual = {
      backend: createMemoryBackend(),
      connect: "manual",
    } as const;

    it("returns the SyncEngine", () => {
      expectTypeOf(syncStateTree(store, manual)).toEqualTypeOf<SyncEngine>();
    });

    it("types keys, omit and filter by the node's snapshot", () => {
      syncStateTree(store, { ...manual, keys: ["todos"] });
      syncStateTree(store, { ...manual, omit: ["filter"] });
      syncStateTree(store, {
        ...manual,
        filter: (key) => {
          expectTypeOf(key).toEqualTypeOf<"todos" | "filter">();
          return true;
        },
      });
    });

    it("types them by a subtree's snapshot", () => {
      const required = types
        .model("Required", { counter: Counter, name: "" })
        .create({ counter: {} }).counter;

      syncStateTree(required, { ...manual, keys: ["count"] });
      // @ts-expect-error `name` belongs to the parent
      syncStateTree(required, { ...manual, keys: ["name"] });
    });

    it("types them by the snapshot of a node held in a maybe prop", () => {
      const { counter } = createWorkspace();
      const nullable = types
        .model("Nullable", { counter: types.maybeNull(Counter) })
        .create({ counter: {} }).counter!;

      syncStateTree(counter, { ...manual, keys: ["count"] });
      syncStateTree(nullable, { ...manual, keys: ["count"] });
      // @ts-expect-error `name` belongs to the parent
      syncStateTree(counter, { ...manual, keys: ["name"] });
    });

    it("rejects unknown names and keys with omit", () => {
      // @ts-expect-error `todo` is not in the snapshot
      syncStateTree(store, { ...manual, keys: ["todo"] });
      // @ts-expect-error `add` is an action, not in the snapshot
      syncStateTree(store, { ...manual, omit: ["add"] });
      // @ts-expect-error `keys` and `omit` do not combine
      syncStateTree(store, { ...manual, keys: ["todos"], omit: ["filter"] });
    });

    it("takes a connect mode, not a boolean", () => {
      expectTypeOf<SyncStateTreeOptions>()
        .toHaveProperty("connect")
        .toEqualTypeOf<"auto" | "manual" | undefined>();

      // @ts-expect-error `connect` takes a mode
      syncStateTree(store, { ...manual, connect: true });
      // @ts-expect-error `connect` takes a mode
      syncStateTree(store, { ...manual, connect: false });
    });

    it("takes a state tree node, and the backend in the options", () => {
      const { backend } = manual;

      expect(() =>
        // @ts-expect-error the backend is required
        syncStateTree(store, { keys: ["todos"] }),
      ).toThrow(TypeError);
      expect(() =>
        // @ts-expect-error the backend goes in the options
        syncStateTree(store, backend, { keys: ["todos"] }),
      ).toThrow(TypeError);
      expect(() =>
        // @ts-expect-error a plain object is not a node
        syncStateTree({ count: 1 }, { backend }),
      ).toThrow();
    });
  });
});
