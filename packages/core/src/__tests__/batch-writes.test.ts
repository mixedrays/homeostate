import { describe, expect, it, vi } from "vitest";
import {
  createSyncEngine,
  type StoreAdapter,
  type SyncEngineConfig,
  type SyncEvent,
} from "../index.js";
import { createMemoryBackend } from "../testing.js";
import {
  addTodo,
  createTestStore,
  deleteTodo,
  renameTodo,
  setSearchTerm,
  threeTodos,
  todo,
  toggleTodo,
  type TodoState,
} from "./helpers.js";

/** Lets the microtasks queued so far run. */
const microtask = (): Promise<void> => Promise.resolve();

/**
 * A store whose adapter sets `batchWrites`, and whose `mutate` notifies once per step, as
 * a store that notifies on every property set does for one array method.
 */
const createPerSetStore = (initial: TodoState = threeTodos()) => {
  const store = createTestStore(initial);
  const adapter: StoreAdapter<TodoState> = {
    ...store.adapter,
    batchWrites: true,
  };
  return {
    ...store,
    adapter,
    /** Changes the store through each of the `steps` in turn, notifying after each. */
    mutate: (...steps: ((state: TodoState) => TodoState)[]) => {
      for (const step of steps) store.update(step);
    },
  };
};

/** Connects a per-set store holding `initial` to a memory backend, recording sync events. */
const setup = (
  initial: TodoState = threeTodos(),
  config: SyncEngineConfig<TodoState> = {},
) => {
  const backend = createMemoryBackend(initial);
  const store = createPerSetStore(initial);
  const engine = createSyncEngine(backend, store.adapter, config);
  const events: SyncEvent[] = [];
  engine.subscribe((event) => events.push(event));
  engine.connect();
  events.length = 0;
  const write = vi.spyOn(backend, "write");
  return { backend, store, engine, events, write };
};

describe("an adapter with batchWrites", () => {
  it("writes the notifications of one task once, after a microtask, with the final state", async () => {
    const { backend, store, events, write } = setup();
    const removed = deleteTodo(threeTodos(), "1");

    // The intermediate states `splice(0, 1)` passes through on a proxy.
    store.mutate(
      (s) => ({ ...s, todos: [s.todos[1], s.todos[1], s.todos[2]] }),
      (s) => ({ ...s, todos: [s.todos[0], s.todos[2], s.todos[2]] }),
      () => removed,
    );

    expect(write).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    await microtask();
    expect(write).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual(removed);
    expect(events).toEqual(["local"]);
  });

  it("writes again for a notification after the flush", async () => {
    const { backend, store, write } = setup();

    store.mutate((s) => toggleTodo(s, "1"));
    await microtask();
    store.mutate((s) => toggleTodo(s, "2"));
    await microtask();

    expect(write).toHaveBeenCalledTimes(2);
    expect(backend.read()).toEqual(
      toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
    );
  });

  it("writes nothing and sends no local event after applying a remote change", async () => {
    const { backend, store, events, write } = setup();
    const remote = addTodo(threeTodos(), todo("4"));

    backend.receive(remote);
    await microtask();

    expect(store.getState()).toEqual(remote);
    expect(write).not.toHaveBeenCalled();
    expect(events).toEqual(["remote"]);
  });

  describe("a remote change while a write is pending", () => {
    it("merges the pending local change into the apply and writes the result once", async () => {
      const { backend, store, events, write } = setup();

      store.mutate((s) => toggleTodo(s, "2"));
      backend.receive(setSearchTerm(threeTodos(), "remote"));

      const both = toggleTodo(setSearchTerm(threeTodos(), "remote"), "2");
      expect(store.getState()).toEqual(both);
      expect(backend.read()).toEqual(both);
      expect(write).toHaveBeenCalledTimes(1);
      expect(events).toEqual(["remote"]);
      await microtask();
      expect(write).toHaveBeenCalledTimes(1);
      expect(events).toEqual(["remote"]);
    });

    it("lands a local edit on the item it targeted after a remote insert in front", () => {
      const { backend, store } = setup();

      store.mutate((s) => renameTodo(s, "2", "Local"));
      backend.receive({
        ...threeTodos(),
        todos: [todo("0"), ...threeTodos().todos],
      });

      expect(store.getState().todos).toEqual([
        todo("0"),
        todo("1"),
        todo("2", "Local"),
        todo("3"),
      ]);
      expect(backend.read()).toEqual(store.getState());
    });

    it("keeps the items both sides inserted at one place, the remote ones first", () => {
      const { backend, store } = setup();

      store.mutate((s) => addTodo(s, todo("local")));
      backend.receive(addTodo(threeTodos(), todo("remote")));

      expect(store.getState().todos.map((t) => t.id)).toEqual([
        "1",
        "2",
        "3",
        "remote",
        "local",
      ]);
      expect(backend.read()).toEqual(store.getState());
    });

    it("lets the remote change replace the pending one after a write threw", async () => {
      const onError = vi.fn();
      const { backend, store, write } = setup(threeTodos(), { onError });
      write.mockImplementationOnce(() => {
        throw new Error("offline");
      });
      store.mutate((s) => toggleTodo(s, "1"));
      await microtask();
      expect(onError).toHaveBeenCalledTimes(1);
      write.mockClear();

      store.mutate((s) => toggleTodo(s, "2"));
      const remote = setSearchTerm(threeTodos(), "remote");
      backend.receive(remote);
      await microtask();

      expect(store.getState()).toEqual(remote);
      expect(backend.read()).toEqual(remote);
      expect(write).not.toHaveBeenCalled();
    });

    it("writes nothing when the store ignores the apply", async () => {
      const backend = createMemoryBackend(threeTodos());
      const store = createPerSetStore();
      createSyncEngine(backend, {
        ...store.adapter,
        setState: () => {},
      }).connect();
      const write = vi.spyOn(backend, "write");

      store.mutate((s) => toggleTodo(s, "1"));
      const remote = setSearchTerm(threeTodos(), "remote");
      backend.receive(remote);
      await microtask();

      expect(write).not.toHaveBeenCalled();
      expect(backend.read()).toEqual(remote);
    });

    it("merges a pending local change when the scheduled apply runs first", () => {
      const queued: (() => void)[] = [];
      const { backend, store, write } = setup(threeTodos(), {
        schedule: (flush) => {
          queued.push(flush);
        },
      });

      store.mutate((s) => toggleTodo(s, "2"));
      backend.receive(setSearchTerm(threeTodos(), "remote"));
      queued.splice(0).forEach((flush) => flush());

      const both = toggleTodo(setSearchTerm(threeTodos(), "remote"), "2");
      expect(store.getState()).toEqual(both);
      expect(backend.read()).toEqual(both);
      expect(write).toHaveBeenCalledTimes(1);
    });

    it("merges a pending remote change when the batched write runs first", async () => {
      const { backend, store, write } = setup(threeTodos(), {
        schedule: () => {},
      });

      backend.receive(setSearchTerm(threeTodos(), "remote"));
      store.mutate((s) => toggleTodo(s, "2"));
      await microtask();

      const both = toggleTodo(setSearchTerm(threeTodos(), "remote"), "2");
      expect(store.getState()).toEqual(both);
      expect(backend.read()).toEqual(both);
      expect(write).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    it("writes the pending local change, then disconnects", () => {
      const { backend, store, engine, events } = setup();

      store.mutate((s) => toggleTodo(s, "1"));
      engine.disconnect();

      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
      expect(events).toEqual(["local", "disconnect"]);
    });

    it("runs a pending scheduled apply merged with the pending local change", () => {
      const { backend, store, engine, events } = setup(threeTodos(), {
        schedule: () => {},
      });

      backend.receive(setSearchTerm(threeTodos(), "remote"));
      store.mutate((s) => toggleTodo(s, "2"));
      engine.disconnect();

      const both = toggleTodo(setSearchTerm(threeTodos(), "remote"), "2");
      expect(store.getState()).toEqual(both);
      expect(backend.read()).toEqual(both);
      expect(events).toEqual(["remote", "disconnect"]);
    });

    it("reports a pending write that throws to onError, and disconnects", () => {
      const onError = vi.fn();
      const { store, engine, events, write } = setup(threeTodos(), {
        onError,
      });
      const offline = new Error("offline");
      write.mockImplementationOnce(() => {
        throw offline;
      });

      store.mutate((s) => toggleTodo(s, "1"));
      expect(() => engine.disconnect()).not.toThrow();

      expect(onError).toHaveBeenCalledWith(offline, "backend");
      expect(engine.isConnected()).toBe(false);
      expect(events).toEqual(["disconnect"]);
      expect(engine.getStatus().failure).toEqual({
        error: offline,
        source: "backend",
      });
    });

    it("throws a pending write's error without onError, and disconnects", () => {
      const { store, engine, write } = setup();
      const offline = new Error("offline");
      write.mockImplementationOnce(() => {
        throw offline;
      });

      store.mutate((s) => toggleTodo(s, "1"));

      expect(() => engine.disconnect()).toThrow(offline);
      expect(engine.isConnected()).toBe(false);
    });

    it("leaves nothing for a flush handed out before disconnect", async () => {
      const { store, engine, write } = setup();

      store.mutate((s) => toggleTodo(s, "1"));
      engine.disconnect();
      write.mockClear();
      await microtask();

      expect(write).not.toHaveBeenCalled();
    });

    it("leaves nothing for a flush handed out before a reconnect", async () => {
      const { backend, store, engine, events, write } = setup();

      store.mutate((s) => toggleTodo(s, "1"));
      engine.disconnect();
      // Unheard while disconnected; the backend's value wins on connect.
      store.update((s) => setSearchTerm(s, "offline"));
      engine.connect();
      write.mockClear();
      events.length = 0;
      await microtask();

      expect(write).not.toHaveBeenCalled();
      expect(events).toEqual([]);
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });
  });

  it("reports a batched write that throws to onError", async () => {
    const onError = vi.fn();
    const { store, engine, write } = setup(threeTodos(), { onError });
    const offline = new Error("offline");
    write.mockImplementationOnce(() => {
      throw offline;
    });

    store.mutate((s) => toggleTodo(s, "1"));
    await microtask();

    expect(onError).toHaveBeenCalledWith(offline, "backend");
    expect(engine.getStatus().failure).toEqual({
      error: offline,
      source: "backend",
    });
  });

  it("throws a batched write's error from the microtask without onError, not from the change", () => {
    // The flush is run by hand, to see what it throws: in a real microtask it would be uncaught.
    const queued: (() => void)[] = [];
    vi.stubGlobal("queueMicrotask", (flush: () => void) => {
      queued.push(flush);
    });
    try {
      const { store, engine, write } = setup();
      const offline = new Error("offline");
      write.mockImplementationOnce(() => {
        throw offline;
      });

      expect(() => store.mutate((s) => toggleTodo(s, "1"))).not.toThrow();
      expect(queued).toHaveLength(1);
      expect(() => queued[0]()).toThrow(offline);
      expect(engine.isConnected()).toBe(true);
      expect(engine.getStatus().failure).toEqual({
        error: offline,
        source: "backend",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("writes a change made while waiting for ready once ready resolves", async () => {
    let resolve!: () => void;
    const ready = new Promise<void>((r) => (resolve = r));
    const backend = createMemoryBackend({ todos: [] });
    const store = createPerSetStore();
    const engine = createSyncEngine(backend, store.adapter, {
      seed: "never",
      ready,
    });
    engine.connect();
    const write = vi.spyOn(backend, "write");

    store.mutate((s) => setSearchTerm(s, "x"));
    await microtask();
    expect(write).not.toHaveBeenCalled();
    resolve();
    await ready;
    await microtask();

    expect(engine.isReady()).toBe(true);
    expect(backend.read()).toEqual({
      ...threeTodos(),
      todos: [],
      searchTerm: "x",
    });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe("an adapter without batchWrites", () => {
  it("writes each notification synchronously", () => {
    const backend = createMemoryBackend(threeTodos());
    const store = createTestStore(threeTodos());
    createSyncEngine(backend, store.adapter).connect();
    const write = vi.spyOn(backend, "write");

    store.update((s) => toggleTodo(s, "1"));
    store.update((s) => toggleTodo(s, "2"));

    expect(write).toHaveBeenCalledTimes(2);
    expect(backend.read()).toEqual(
      toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
    );
  });
});
