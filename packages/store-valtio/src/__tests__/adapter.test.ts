import { describe, expect, it, vi } from "vitest";
import { proxy, snapshot } from "valtio/vanilla";
import { createSyncEngine, type SyncEvent } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createValtioAdapter } from "../index.js";

interface Todo {
  id: string;
  done: boolean;
}

const createTodos = () =>
  proxy({
    todos: [
      { id: "1", done: false },
      { id: "2", done: false },
    ] as Todo[],
    filter: "all",
    toggle(id: string) {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    },
  });

const plain = (state: ReturnType<typeof createTodos>) => {
  const { todos, filter } = snapshot(state);
  return { todos, filter };
};

/** Lets the write a mutation queued run. */
const flush = (): Promise<void> => Promise.resolve();

describe("ValtioAdapter", () => {
  it("seeds the backend, writes proxy mutations, and applies remote changes", async () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    const engine = createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    });

    engine.connect();
    expect(backend.read()).toEqual(plain(state));

    state.toggle("2");
    await flush();
    expect(backend.read()).toEqual({
      todos: [
        { id: "1", done: false },
        { id: "2", done: true },
      ],
      filter: "all",
    });

    backend.receive({ todos: [{ id: "3", done: true }], filter: "done" });
    expect(plain(state)).toEqual({
      todos: [{ id: "3", done: true }],
      filter: "done",
    });
    expect(typeof state.toggle).toBe("function");
  });

  it("adopts a non-empty backend as the initial state", () => {
    const state = createTodos();
    const backend = createMemoryBackend({ todos: [], filter: "active" });

    createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    }).connect();

    expect(plain(state)).toEqual({ todos: [], filter: "active" });
  });

  it("keeps the proxy mutable after remote changes and syncs those mutations back", async () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    }).connect();

    backend.receive({ todos: [{ id: "9", done: false }], filter: "all" });
    state.toggle("9");
    await flush();

    expect(snapshot(state).todos[0].done).toBe(true);
    expect(backend.read()).toEqual({
      todos: [{ id: "9", done: true }],
      filter: "all",
    });
  });

  it("preserves the identity of unchanged subtrees when applying remote changes", () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    }).connect();
    const untouched = snapshot(state).todos[1];

    backend.receive({
      todos: [
        { id: "1", done: true },
        { id: "2", done: false },
      ],
      filter: "all",
    });

    expect(snapshot(state).todos[0].done).toBe(true);
    expect(snapshot(state).todos[1]).toBe(untouched);
  });

  it("stops both directions after disconnect", async () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    const engine = createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    });
    engine.connect();

    engine.disconnect();
    state.filter = "done";
    await flush();
    expect((backend.read() as { filter: string }).filter).toBe("all");

    backend.receive({ todos: [], filter: "active" });
    expect(snapshot(state).filter).toBe("done");
  });

  it("writes a mutation after a microtask", async () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    }).connect();

    state.filter = "done";
    expect((backend.read() as { filter: string }).filter).toBe("all");
    await flush();
    expect((backend.read() as { filter: string }).filter).toBe("done");
  });

  it("writes a mutation made just before disconnect", () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    const engine = createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    });
    engine.connect();

    state.filter = "done";
    engine.disconnect();

    expect((backend.read() as { filter: string }).filter).toBe("done");
  });

  describe("one array method", () => {
    const methods: [string, (log: string[]) => void, string[]][] = [
      ["push", (log) => log.push("d"), ["a", "b", "c", "d"]],
      [
        "splice to insert",
        (log) => log.splice(0, 0, "x"),
        ["x", "a", "b", "c"],
      ],
      ["splice to remove", (log) => log.splice(1, 1), ["a", "c"]],
      [
        "splice to move",
        (log) => log.splice(0, 0, ...log.splice(2, 1)),
        ["c", "a", "b"],
      ],
      ["unshift", (log) => log.unshift("z"), ["z", "a", "b", "c"]],
      ["shift", (log) => log.shift(), ["b", "c"]],
      [
        "sort",
        (log) => log.sort((x, y) => y.localeCompare(x)),
        ["c", "b", "a"],
      ],
      ["reverse", (log) => log.reverse(), ["c", "b", "a"]],
    ];

    it.each(methods)(
      "writes %s once, with its result",
      async (_, method, result) => {
        const state = proxy({ log: ["a", "b", "c"] });
        const backend = createMemoryBackend();
        createSyncEngine({
          backend,
          adapter: createValtioAdapter(state),
        }).connect();
        const write = vi.spyOn(backend, "write");

        method(state.log);
        await flush();

        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.calls[0][0]).toEqual({ log: result });
        expect(backend.read()).toEqual({ log: result });
      },
    );
  });

  it("writes nothing back and sends no local event for a remote change", async () => {
    const state = createTodos();
    const backend = createMemoryBackend();
    const engine = createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    });
    engine.connect();
    const write = vi.spyOn(backend, "write");
    const events: SyncEvent[] = [];
    engine.subscribe((event) => events.push(event));

    backend.receive({
      todos: [
        { id: "2", done: true },
        { id: "1", done: false },
      ],
      filter: "done",
    });
    await flush();

    expect(write).not.toHaveBeenCalled();
    expect(events).toEqual(["remote"]);
  });

  it("keeps a mutation a remote change arrives before, merged with it", async () => {
    const state = proxy({ log: [] as string[], title: "" });
    const backend = createMemoryBackend();
    createSyncEngine({
      backend,
      adapter: createValtioAdapter(state),
    }).connect();

    state.log.push("local");
    backend.receive({ log: [], title: "remote" });
    await flush();

    expect(snapshot(state)).toEqual({ log: ["local"], title: "remote" });
    expect(backend.read()).toEqual({ log: ["local"], title: "remote" });
  });
});
