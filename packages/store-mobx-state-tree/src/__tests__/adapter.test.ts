import { afterEach, describe, expect, it, vi } from "vitest";
import { reaction } from "mobx";
import { getSnapshot, types } from "mobx-state-tree";
import { createSyncEngine } from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import {
  createMobxStateTreeAdapter,
  type SnapshotValidationError,
} from "../index.js";

const Todo = types.model("Todo", {
  id: types.identifier,
  title: types.string,
  done: false,
});

const TodoStore = types
  .model("TodoStore", {
    todos: types.array(Todo),
    filter: types.optional(types.string, "all"),
  })
  .actions((self) => ({
    add(id: string, title: string) {
      self.todos.push({ id, title });
    },
    toggle(id: string) {
      const todo = self.todos.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    },
    reset(filter: string) {
      self.todos.clear();
      self.filter = filter;
    },
  }));

const createStore = () =>
  TodoStore.create({
    todos: [
      { id: "1", title: "a" },
      { id: "2", title: "b" },
    ],
  });

const countingWrites = (backend: MemoryBackend) => {
  const writes: unknown[] = [];
  const counting: MemoryBackend = {
    ...backend,
    write: (next) => {
      writes.push(next);
      backend.write(next);
    },
  };
  return { backend: counting, writes };
};

describe("MobxStateTreeAdapter", () => {
  it("seeds the backend, writes actions, and applies remote changes", () => {
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine({
      backend,
      adapter: createMobxStateTreeAdapter(store),
    });

    engine.connect();
    expect(backend.read()).toEqual({
      todos: [
        { id: "1", title: "a", done: false },
        { id: "2", title: "b", done: false },
      ],
      filter: "all",
    });

    store.toggle("2");
    expect(
      (backend.read() as { todos: { done: boolean }[] }).todos[1].done,
    ).toBe(true);

    backend.receive({
      todos: [{ id: "3", title: "c", done: true }],
      filter: "done",
    });
    expect(getSnapshot(store)).toEqual({
      todos: [{ id: "3", title: "c", done: true }],
      filter: "done",
    });
    expect(store.todos[0].done).toBe(true);
  });

  it("adopts a non-empty backend as the initial state", () => {
    const store = createStore();
    const backend = createMemoryBackend({ todos: [], filter: "active" });

    createSyncEngine({
      backend,
      adapter: createMobxStateTreeAdapter(store),
    }).connect();

    expect(getSnapshot(store)).toEqual({ todos: [], filter: "active" });
  });

  it("writes once per action even when the action mutates several fields", () => {
    const store = createStore();
    const { backend, writes } = countingWrites(createMemoryBackend());
    createSyncEngine({
      backend,
      adapter: createMobxStateTreeAdapter(store),
    }).connect();
    expect(writes).toHaveLength(1);

    store.reset("done");

    expect(writes).toHaveLength(2);
    expect(backend.read()).toEqual({ todos: [], filter: "done" });
  });

  it("reconciles remote changes onto existing instances by identifier", () => {
    const store = createStore();
    const backend = createMemoryBackend();
    createSyncEngine({
      backend,
      adapter: createMobxStateTreeAdapter(store),
    }).connect();
    const second = store.todos[1];

    backend.receive({
      todos: [
        { id: "1", title: "a", done: true },
        { id: "2", title: "b", done: false },
      ],
      filter: "all",
    });

    expect(store.todos[0].done).toBe(true);
    expect(store.todos[1]).toBe(second);
  });

  it("writes a field an afterAttach hook sets on a remotely inserted item", () => {
    const Item = types
      .model("Item", { id: types.identifier, createdAt: 0 })
      .actions((self) => ({
        afterAttach() {
          if (self.createdAt === 0) self.createdAt = 12345;
        },
      }));
    const store = types
      .model("ItemStore", { items: types.array(Item) })
      .create({ items: [] });
    const backend = createMemoryBackend();
    createSyncEngine({
      backend,
      adapter: createMobxStateTreeAdapter(store),
    }).connect();
    // An observer makes MST create the inserted node, so its hook runs, during the apply.
    const stop = reaction(
      () => store.items.map((item) => item.createdAt),
      () => {},
    );

    backend.receive({ items: [{ id: "1", createdAt: 0 }] });

    expect(getSnapshot(store)).toEqual({
      items: [{ id: "1", createdAt: 12345 }],
    });
    expect(backend.read()).toEqual({ items: [{ id: "1", createdAt: 12345 }] });
    stop();
  });

  it("stops both directions after disconnect", () => {
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine({
      backend,
      adapter: createMobxStateTreeAdapter(store),
    });
    engine.connect();

    engine.disconnect();
    store.add("3", "c");
    expect((backend.read() as { todos: unknown[] }).todos).toHaveLength(2);

    backend.receive({ todos: [], filter: "all" });
    expect(store.todos).toHaveLength(3);
  });
});

describe("an invalid remote snapshot", () => {
  const Item = types.model("Item", {
    id: types.identifier,
    title: types.string,
  });
  const ItemStore = types
    .model("ItemStore", { items: types.array(Item) })
    .actions((self) => ({
      add(id: string) {
        self.items.push({ id, title: id });
      },
    }));
  const kept = { id: "ok", title: "kept" };
  const invalid = { items: [kept, { id: 2, title: "bad" }] };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(["development", "production"])("in %s mode", (mode) => {
    const setup = (
      options?: Parameters<typeof createMobxStateTreeAdapter>[1],
    ) => {
      vi.stubEnv("NODE_ENV", mode);
      const store = ItemStore.create({ items: [] });
      const backend = createMemoryBackend();
      const engine = createSyncEngine({
        backend,
        adapter: createMobxStateTreeAdapter(store, options),
      });
      engine.connect();
      return { store, backend, engine };
    };

    describe('with onInvalidSnapshot: "skip"', () => {
      it("leaves the store unchanged, throws nothing and stays connected", () => {
        const { store, backend, engine } = setup({
          onInvalidSnapshot: "skip",
        });

        expect(() => backend.receive(invalid)).not.toThrow();

        expect(getSnapshot(store)).toEqual({ items: [] });
        expect(engine.getStatus()).toEqual({ connected: true, failure: null });
        expect(backend.read()).toEqual(invalid);
      });

      it("applies a later valid remote state", () => {
        const { store, backend } = setup({ onInvalidSnapshot: "skip" });
        backend.receive(invalid);

        backend.receive({ items: [kept] });

        expect(getSnapshot(store)).toEqual({ items: [kept] });
      });

      it("leaves the node as it is when the room it connects to is invalid", () => {
        vi.stubEnv("NODE_ENV", mode);
        const store = ItemStore.create({ items: [{ id: "a", title: "a" }] });
        const backend = createMemoryBackend(invalid);
        const engine = createSyncEngine({
          backend,
          adapter: createMobxStateTreeAdapter(store, {
            onInvalidSnapshot: "skip",
          }),
        });

        engine.connect();

        expect(engine.getStatus().connected).toBe(true);
        expect(getSnapshot(store)).toEqual({
          items: [{ id: "a", title: "a" }],
        });
        expect(backend.read()).toEqual(invalid);
      });

      it("lets the next local change overwrite the rejected state in the backend", () => {
        const { store, backend } = setup({ onInvalidSnapshot: "skip" });
        backend.receive(invalid);

        store.add("local");

        expect(backend.read()).toEqual({
          items: [{ id: "local", title: "local" }],
        });
      });
    });

    describe('with onInvalidSnapshot: "throw"', () => {
      it("throws MST's type check error to the notifier and leaves the store unchanged", () => {
        const { store, backend, engine } = setup({
          onInvalidSnapshot: "throw",
        });

        expect(() => backend.receive(invalid)).toThrow(
          /Error while converting .* to `ItemStore`.*at path "\/items\/1\/id"/s,
        );

        expect(getSnapshot(store)).toEqual({ items: [] });
        expect(engine.getStatus().connected).toBe(true);
        expect(engine.getStatus().failure?.source).toBe("store");
      });

      it("hands the error to the engine's onError instead", () => {
        vi.stubEnv("NODE_ENV", mode);
        const store = ItemStore.create({ items: [] });
        const backend = createMemoryBackend();
        const onError = vi.fn();
        createSyncEngine({
          backend,
          adapter: createMobxStateTreeAdapter(store, {
            onInvalidSnapshot: "throw",
          }),
          onError,
        }).connect();

        expect(() => backend.receive(invalid)).not.toThrow();

        expect(onError).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            message: expect.stringMatching(/Error while converting/),
          }),
          "store",
        );
        expect(getSnapshot(store)).toEqual({ items: [] });
      });

      it("makes connect() throw for an invalid room", () => {
        vi.stubEnv("NODE_ENV", mode);
        const store = ItemStore.create({ items: [] });
        const engine = createSyncEngine({
          backend: createMemoryBackend(invalid),
          adapter: createMobxStateTreeAdapter(store, {
            onInvalidSnapshot: "throw",
          }),
        });

        expect(() => engine.connect()).toThrow(/Error while converting/);
        expect(engine.getStatus().connected).toBe(false);
        expect(getSnapshot(store)).toEqual({ items: [] });
      });
    });

    describe("with an onInvalidSnapshot handler", () => {
      it("passes MST's validation errors and the state, and leaves the store unchanged", () => {
        const handler = vi.fn();
        const { store, backend, engine } = setup({
          onInvalidSnapshot: handler,
        });

        backend.receive(invalid);

        expect(handler).toHaveBeenCalledOnce();
        const [errors, snapshot] = handler.mock.calls[0];
        expect(snapshot).toEqual(invalid);
        expect(
          errors.map((error: SnapshotValidationError) => ({
            path: error.context.map(({ path }) => path).join("/"),
            value: error.value,
          })),
        ).toEqual([{ path: "/items/1/id", value: 2 }]);
        expect(getSnapshot(store)).toEqual({ items: [] });
        expect(engine.getStatus()).toEqual({ connected: true, failure: null });
      });

      it("is not called for a valid state", () => {
        const handler = vi.fn();
        const { store, backend } = setup({ onInvalidSnapshot: handler });

        backend.receive({ items: [kept] });

        expect(handler).not.toHaveBeenCalled();
        expect(getSnapshot(store)).toEqual({ items: [kept] });
      });

      it("throws what the handler throws, as the store's error", () => {
        const failure = new Error("needs a migration");
        const { store, backend, engine } = setup({
          onInvalidSnapshot: () => {
            throw failure;
          },
        });

        expect(() => backend.receive(invalid)).toThrow(failure);

        expect(engine.getStatus().failure).toEqual({
          error: failure,
          source: "store",
        });
        expect(getSnapshot(store)).toEqual({ items: [] });
      });
    });
  });

  describe("without onInvalidSnapshot", () => {
    const setup = (mode: string) => {
      vi.stubEnv("NODE_ENV", mode);
      const store = ItemStore.create({ items: [] });
      const backend = createMemoryBackend();
      createSyncEngine({
        backend,
        adapter: createMobxStateTreeAdapter(store),
      }).connect();
      return { store, backend };
    };

    it("throws MST's type check error in development mode", () => {
      const { store, backend } = setup("development");

      expect(() => backend.receive(invalid)).toThrow(/Error while converting/);

      expect(getSnapshot(store)).toEqual({ items: [] });
    });

    it("applies the state unchecked with type checking disabled", () => {
      const { store, backend } = setup("production");

      expect(() => backend.receive(invalid)).not.toThrow();

      expect(getSnapshot(store)).toEqual({
        items: [kept, { id: 2, title: "bad" }],
      });
    });
  });
});
