import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  createSyncEngine,
  type CrdtBackend,
  type JsonObjectInput,
  WriteLoopError,
  type SyncEngineConfig,
} from "../index.js";
import { createMemoryBackend, type MemoryBackend } from "../testing.js";
import {
  addTodo,
  createTestStore,
  deepFreeze,
  deleteTodo,
  prototypeHijacks,
  prototypeMemberKeys,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  toggleTodo,
  type TestStore,
  type TodoState,
} from "./helpers.js";

/**
 * A memory backend that records the `previous` of every write and checks that it is what the
 * backend held, as JSON would store it, which is what `CrdtBackend.write` promises.
 */
const checkedBackend = (initial?: JsonObjectInput) => {
  const backend = createMemoryBackend(initial);
  const write = backend.write;
  const previous: unknown[] = [];
  backend.write = (next, held) => {
    previous.push(held);
    if (held !== undefined) expect(snapshot(held)).toEqual(backend.read());
    write(next);
  };
  return { backend, previous };
};

describe("createSyncEngine", () => {
  describe("connect", () => {
    it("seeds an empty backend with the filtered initial state", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ ...threeTodos(), addTodo: () => {} });

      createSyncEngine(backend, store.adapter).connect();

      expect(backend.read()).toEqual(threeTodos());
    });

    it("leaves an empty backend alone with seed 'never'", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());

      createSyncEngine(backend, store.adapter, { seed: "never" }).connect();

      expect(backend.read()).toEqual({});
      expect(store.getState()).toEqual(threeTodos());
    });

    it("adopts a non-empty backend and keeps non-synced members", () => {
      const backend = createMemoryBackend(threeTodos());
      const increment = () => {};
      const store = createTestStore({
        ...threeTodos(),
        todos: [todo("local")],
        searchTerm: "local",
        increment,
      });

      createSyncEngine(backend, store.adapter).connect();

      expect(store.getState()).toEqual({ ...threeTodos(), increment });
      expect(store.getState().increment).toBe(increment);
      expect(backend.read()).toEqual(threeTodos());
    });

    it("subscribes once even when called twice", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();
      engine.connect();
      const write = vi.spyOn(backend, "write");

      store.update((s) => toggleTodo(s, "1"));

      expect(write).toHaveBeenCalledTimes(1);
      expect(engine.isConnected()).toBe(true);
    });

    it("keeps synced keys the backend lacks and seeds them in one write", () => {
      const backend = createMemoryBackend({ todos: [todo("remote")] });
      const store = createTestStore(threeTodos());
      const write = vi.spyOn(backend, "write");

      createSyncEngine(backend, store.adapter).connect();

      const expected = { ...threeTodos(), todos: [todo("remote")] };
      expect(store.getState()).toEqual(expected);
      expect(write).toHaveBeenCalledTimes(1);
      expect(backend.read()).toEqual(expected);
    });

    it("keeps synced keys the backend lacks without writing them with seed 'never'", () => {
      const backend = createMemoryBackend({ todos: [todo("remote")] });
      const store = createTestStore(threeTodos());

      createSyncEngine(backend, store.adapter, { seed: "never" }).connect();

      expect(store.getState()).toEqual({
        ...threeTodos(),
        todos: [todo("remote")],
      });
      expect(backend.read()).toEqual({ todos: [todo("remote")] });
    });

    it("seeds a backend that holds only keys the filter excludes", () => {
      const backend = createMemoryBackend({ secret: "remote" });
      const store = createTestStore(threeTodos());

      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "secret",
      }).connect();

      expect(store.getState()).toEqual(threeTodos());
      expect(backend.read()).toEqual(threeTodos());
    });

    it("leaves the store object untouched when every backend key already matches", () => {
      const backend = createMemoryBackend({ todos: threeTodos().todos });
      const store = createTestStore(threeTodos());
      const before = store.getState();
      const setState = vi.spyOn(store.adapter, "setState");

      createSyncEngine(backend, store.adapter).connect();

      expect(setState).not.toHaveBeenCalled();
      expect(store.getState()).toBe(before);
    });

    it("leaves the store object untouched when it holds NaN", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ ...threeTodos(), progress: NaN });
      const before = store.getState();
      const setState = vi.spyOn(store.adapter, "setState");

      createSyncEngine(backend, store.adapter).connect();

      expect(setState).not.toHaveBeenCalled();
      expect(store.getState()).toBe(before);
    });

    it("seeds an empty backend with what the store holds at connect time", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      store.update((s) => toggleTodo(s, "1"));

      engine.connect();

      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });
  });

  describe("store to backend", () => {
    it("writes store changes to the backend", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();

      store.update((s) => addTodo(toggleTodo(s, "1"), todo("4")));

      expect(backend.read()).toEqual(
        addTodo(toggleTodo(threeTodos(), "1"), todo("4")),
      );
    });

    it("excludes functions from every write by default", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ ...threeTodos(), addTodo: () => {} });
      createSyncEngine(backend, store.adapter).connect();

      store.update((s) => ({ ...s, searchTerm: "x", later: () => {} }));

      expect(backend.read()).toEqual(setSearchTerm(threeTodos(), "x"));
    });

    it("does not echo a remote change back into the backend", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const write = vi.spyOn(backend, "write");

      backend.receive(toggleTodo(threeTodos(), "1"));

      expect(write).not.toHaveBeenCalled();
    });
  });

  describe("backend to store", () => {
    it("applies remote changes with new containers along the changed path only", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const before = store.getState();
      const beforeSnapshot = snapshot(before);

      backend.receive(toggleTodo(threeTodos(), "1"));

      const after = store.getState();
      expect(after).toEqual(toggleTodo(threeTodos(), "1"));
      expect(after).not.toBe(before);
      expect(after.todos).not.toBe(before.todos);
      expect(after.todos[0]).not.toBe(before.todos[0]);
      expect(after.todos[1]).toBe(before.todos[1]);
      expect(after.todos[2]).toBe(before.todos[2]);
      expect(before).toEqual(beforeSnapshot);
    });

    it("removes keys deleted remotely and adds new ones", () => {
      const backend = createMemoryBackend();
      const store = createTestStore<Record<string, unknown>>({ a: 1, b: 2 });
      createSyncEngine(backend, store.adapter).connect();

      backend.receive({ b: 2, c: 3 });

      expect(store.getState()).toEqual({ b: 2, c: 3 });
    });

    it("leaves the store untouched when the remote state already matches", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const setState = vi.spyOn(store.adapter, "setState");
      createSyncEngine(backend, store.adapter).connect();

      backend.receive(threeTodos());

      expect(setState).not.toHaveBeenCalled();
    });

    it("works with deeply frozen store state", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos(), deepFreeze);
      createSyncEngine(backend, store.adapter).connect();

      store.update((s) => toggleTodo(s, "2"));
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "2"));

      const remote = addTodo(toggleTodo(threeTodos(), "2"), todo("4"));
      expect(() => backend.receive(remote)).not.toThrow();
      expect(store.getState()).toEqual(remote);
      expect(Object.isFrozen(store.getState().todos)).toBe(true);
    });
  });

  describe("store changes made while a remote change is applied", () => {
    interface Counted {
      todos: string[];
      count: number;
    }

    /** A store whose `setState` derives `count`, as a normalising reducer would. */
    const normalisingStore = (initial: Counted = { todos: [], count: 0 }) =>
      createTestStore(initial, (next) => ({
        ...next,
        count: next.todos.length,
      }));

    /** A store with a subscriber that keeps `count` in step with `todos`. */
    const subscriberStore = (initial: Counted = { todos: [], count: 0 }) => {
      const store = createTestStore(initial);
      store.adapter.subscribe(() => {
        const state = store.getState();
        if (state.count !== state.todos.length)
          store.setState({ ...state, count: state.todos.length });
      });
      return store;
    };

    it.each([
      ["setState normalises", normalisingStore],
      ["a subscriber derives", subscriberStore],
    ])("writes a key the store changes when %s it", (_, createStore) => {
      const backend = createMemoryBackend();
      const store = createStore();
      createSyncEngine(backend, store.adapter).connect();

      backend.receive({ todos: ["a", "b"], count: 0 });

      expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
      expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
    });

    it("writes once, passing what it read as the previous state", () => {
      const { backend, previous } = checkedBackend();
      const store = subscriberStore();
      createSyncEngine(backend, store.adapter).connect();
      const write = vi.spyOn(backend, "write");

      backend.receive({ todos: ["a", "b"], count: 0 });

      expect(write).toHaveBeenCalledTimes(1);
      expect(previous.at(-1)).toEqual({ todos: ["a", "b"], count: 0 });
    });

    it("writes nothing back when the remote change needs no derived write", () => {
      const backend = createMemoryBackend();
      const store = subscriberStore();
      createSyncEngine(backend, store.adapter).connect();
      const write = vi.spyOn(backend, "write");

      backend.receive({ todos: ["a", "b"], count: 2 });

      expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
      expect(write).not.toHaveBeenCalled();
    });

    it("writes nothing when the store ignores the remote change", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ todos: [] as string[], count: 0 });
      const adapter = { ...store.adapter, setState: () => {} };
      createSyncEngine(backend, adapter).connect();
      const write = vi.spyOn(backend, "write");

      backend.receive({ todos: ["a", "b"], count: 2 });

      expect(store.getState()).toEqual({ todos: [], count: 0 });
      expect(write).not.toHaveBeenCalled();
      expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
    });

    it("writes what the store derives when connecting to a non-empty backend", () => {
      const backend = createMemoryBackend({ todos: ["a", "b"], count: 0 });
      const store = subscriberStore();

      createSyncEngine(backend, store.adapter).connect();

      expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
      expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
    });

    it("writes what the store derives after seeding the keys the backend lacks", () => {
      const { backend, previous } = checkedBackend({ todos: ["a", "b"] });
      const store = createTestStore(
        { todos: [] as string[], count: 0, searchTerm: "local" },
        (next) => ({ ...next, count: next.todos.length }),
      );

      createSyncEngine(backend, store.adapter).connect();

      const expected = { todos: ["a", "b"], count: 2, searchTerm: "local" };
      expect(store.getState()).toEqual(expected);
      expect(backend.read()).toEqual(expected);
      expect(previous.at(-1)).toEqual({
        todos: ["a", "b"],
        count: 0,
        searchTerm: "local",
      });
    });

    it("writes nothing on connect when the store derives nothing new", () => {
      const backend = createMemoryBackend({ todos: ["a", "b"], count: 2 });
      const store = createTestStore({
        todos: [] as string[],
        count: 0,
        searchTerm: "local",
      });
      store.adapter.subscribe(() => {
        const state = store.getState();
        if (state.count !== state.todos.length)
          store.setState({ ...state, count: state.todos.length });
      });
      const write = vi.spyOn(backend, "write");

      createSyncEngine(backend, store.adapter, { seed: "never" }).connect();

      expect(store.getState()).toEqual({
        todos: ["a", "b"],
        count: 2,
        searchTerm: "local",
      });
      expect(write).not.toHaveBeenCalled();
    });

    describe("with schedule", () => {
      const connectScheduled = (
        backend: MemoryBackend,
        store: TestStore<Counted> = subscriberStore(),
      ) => {
        const flushes: (() => void)[] = [];
        const engine = createSyncEngine(backend, store.adapter, {
          schedule: (flush) => {
            flushes.push(flush);
          },
        });
        engine.connect();
        const run = () => flushes.splice(0).forEach((flush) => flush());
        return { store, engine, run };
      };

      it("writes what the store derives when the flush runs", () => {
        const backend = createMemoryBackend();
        const { store, run } = connectScheduled(backend);

        backend.receive({ todos: ["a"], count: 0 });
        backend.receive({ todos: ["a", "b"], count: 0 });
        run();

        expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
        expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
      });

      it("writes what the store derives when disconnect runs the pending apply", () => {
        const backend = createMemoryBackend();
        const { store, engine } = connectScheduled(backend);

        backend.receive({ todos: ["a", "b"], count: 0 });
        engine.disconnect();

        expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
        expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
      });

      it("writes once when a local change runs the pending apply", () => {
        const { backend, previous } = checkedBackend();
        const { store } = connectScheduled(backend, normalisingStore());
        const write = vi.spyOn(backend, "write");

        backend.receive({ todos: ["a", "b"], count: 0 });
        store.update((s) => ({ ...s, todos: [...s.todos, "local"] }));

        expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
        expect(backend.read()).toEqual({ todos: ["a", "b"], count: 2 });
        expect(write).toHaveBeenCalledTimes(1);
        expect(previous.at(-1)).toEqual({ todos: ["a", "b"], count: 0 });
      });

      it("writes nothing when a local change runs a pending apply that needs no derived write", () => {
        const backend = createMemoryBackend();
        const { store } = connectScheduled(backend, normalisingStore());
        const write = vi.spyOn(backend, "write");

        backend.receive({ todos: ["a", "b"], count: 2 });
        store.update((s) => ({ ...s, todos: [...s.todos, "local"] }));

        expect(store.getState()).toEqual({ todos: ["a", "b"], count: 2 });
        expect(write).not.toHaveBeenCalled();
      });
    });

    describe("that keep changing what they receive", () => {
      let warn: MockInstance<typeof console.warn>;
      /** Whether the stores' rules run, so that they start once every peer has connected. */
      let rulesOn = false;
      beforeEach(() => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        rulesOn = false;
      });
      afterEach(() => {
        warn.mockRestore();
      });

      /** Runs `count` rounds of `setTimeout(0)`, so relayed writes arrive. */
      const ticks = async (count: number) => {
        for (let i = 0; i < count; i++)
          await new Promise((resolve) => setTimeout(resolve, 0));
      };

      /**
       * Memory backends whose writes reach every other one asynchronously, as a provider relays
       * them, counting every write.
       */
      const relayedBackends = (count: number) => {
        const backends = Array.from({ length: count }, () =>
          createMemoryBackend(),
        );
        const writes = { count: 0 };
        for (const from of backends) {
          const write = from.write;
          from.write = (next, previous) => {
            writes.count++;
            write(next, previous);
            const sent = snapshot(next);
            for (const to of backends)
              if (to !== from) setTimeout(() => to.receive(sent), 0);
          };
        }
        return { backends, writes };
      };

      /** A `setState` transform that runs `change` once the rules are on. */
      const rule =
        <S>(change: (next: S) => S) =>
        (next: S): S =>
          rulesOn ? change(next) : next;

      /** Connects one store per backend, lets the seed writes settle, then turns the rules on. */
      const connectPeers = async <S extends object>(
        backends: MemoryBackend[],
        stores: TestStore<S>[],
        writes: { count: number },
      ) => {
        backends.forEach((backend, i) =>
          createSyncEngine(backend, stores[i]!.adapter).connect(),
        );
        await ticks(10);
        writes.count = 0;
        rulesOn = true;
      };

      interface Stamped {
        count: number;
        updatedAt?: number;
      }

      let clock = 0;
      /** A store that stamps `updatedAt` on every `setState`, as a replace reducer might. */
      const stampingStore = () =>
        createTestStore<Stamped>(
          { count: 0 },
          rule((next) => ({ ...next, updatedAt: ++clock })),
        );

      it("settles when every peer stamps what it receives", async () => {
        const { backends, writes } = relayedBackends(2);
        const [a, b] = [stampingStore(), stampingStore()];
        await connectPeers(backends, [a, b], writes);

        a.update((s) => ({ ...s, count: 1 }));
        await ticks(40);

        expect(writes.count).toBeLessThan(5);
        expect(a.getState().count).toBe(1);
        expect(b.getState().count).toBe(1);
      });

      it("settles when two peers enforce contradicting rules", async () => {
        const { backends, writes } = relayedBackends(2);
        const initial = { count: 7, todos: [] as string[] };
        const atLeastTen = createTestStore(
          initial,
          rule((next) => ({ ...next, count: Math.max(next.count, 10) })),
        );
        const atMostFive = createTestStore(
          initial,
          rule((next) => ({ ...next, count: Math.min(next.count, 5) })),
        );
        await connectPeers(backends, [atLeastTen, atMostFive], writes);

        atLeastTen.update((s) => ({ ...s, todos: ["a"] }));
        await ticks(40);

        expect(writes.count).toBeLessThan(5);
        expect(atLeastTen.getState().todos).toEqual(["a"]);
        expect(atMostFive.getState().todos).toEqual(["a"]);
      });

      /** One stamping peer whose write back another peer re-stamps twice. */
      const restampWriteBack = (config?: SyncEngineConfig) => {
        rulesOn = true;
        const backend = createMemoryBackend();
        const store = stampingStore();
        createSyncEngine(backend, store.adapter, config).connect();
        const write = vi.spyOn(backend, "write");

        backend.receive({ count: 1, updatedAt: 0 });
        expect(write).toHaveBeenCalledTimes(1);
        const stamped = (backend.read() as unknown as Stamped).updatedAt!;

        backend.receive({ count: 1, updatedAt: -1 });
        backend.receive({ count: 1, updatedAt: -2 });
        return { backend, store, write, stamped };
      };

      it("stops writing back and reports the keys once when a peer re-writes them", () => {
        const { backend, store, write, stamped } = restampWriteBack();

        expect(write).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('"updatedAt"');
        expect(warn.mock.calls[0]![0]).not.toContain('"count"');
        // The store keeps its own stamp, and the backend the peer's.
        expect(store.getState().updatedAt).toBeGreaterThan(stamped);
        expect(backend.read()).toEqual({ count: 1, updatedAt: -2 });
      });

      it("stops a loop without a warning in production", () => {
        vi.stubEnv("NODE_ENV", "production");
        try {
          const { write } = restampWriteBack();

          expect(write).toHaveBeenCalledTimes(1);
          expect(warn).not.toHaveBeenCalled();
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it("reports a stopped loop to onError once, naming its keys, instead of warning", () => {
        const onError = vi.fn();
        const { backend } = restampWriteBack({ onError });
        backend.receive({ count: 1, updatedAt: -3 });

        expect(onError).toHaveBeenCalledTimes(1);
        const [error, source] = onError.mock.calls[0]!;
        expect(source).toBe("store");
        expect(error).toBeInstanceOf(WriteLoopError);
        expect(error).toMatchObject({
          name: "WriteLoopError",
          keys: ["updatedAt"],
        });
        expect((error as Error).message).toContain('"updatedAt"');
        expect(warn).not.toHaveBeenCalled();
      });

      it("reports a stopped loop to onError in production", () => {
        vi.stubEnv("NODE_ENV", "production");
        try {
          const onError = vi.fn();
          restampWriteBack({ onError });

          expect(onError).toHaveBeenCalledWith(
            expect.any(WriteLoopError),
            "store",
          );
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it.each([
        ["setState normalises", normalisingStore],
        ["a subscriber derives", subscriberStore],
        [
          "setState also sorts what the other peer edits",
          () =>
            createTestStore<Counted>({ todos: [], count: 0 }, (next) => ({
              todos: [...next.todos].sort().reverse(),
              count: next.todos.length,
            })),
        ],
      ])(
        "writes back after every remote change that needs it when %s",
        async (_, createStore) => {
          const { backends, writes } = relayedBackends(2);
          const deriving = createStore();
          const editing = createTestStore<Counted>({ todos: [], count: 0 });
          await connectPeers(backends, [deriving, editing], writes);

          for (const [i, item] of ["a", "b", "c", "d", "e"].entries()) {
            editing.update((s) => ({ ...s, todos: [...s.todos, item] }));
            await ticks(10);

            // The edit, then the deriving peer's write back.
            expect(writes.count).toBe(2 * (i + 1));
            expect(editing.getState().count).toBe(i + 1);
          }
          expect(warn).not.toHaveBeenCalled();
        },
      );

      it("settles when three peers stamp what they receive", async () => {
        const { backends, writes } = relayedBackends(3);
        const stores = [stampingStore(), stampingStore(), stampingStore()];
        await connectPeers(backends, stores, writes);

        stores[0]!.update((s) => ({ ...s, count: 1 }));
        await ticks(40);

        expect(writes.count).toBeLessThan(7);
        for (const store of stores) expect(store.getState().count).toBe(1);
      });

      it("settles when three peers each fight another over a different key", async () => {
        interface Pair {
          x: number;
          y: number;
          z: number;
        }
        const { backends, writes } = relayedBackends(3);
        const initial: Pair = { x: 1, y: 1, z: 0 };
        const stores = [
          createTestStore(
            initial,
            rule((next) => ({ ...next, x: 1, y: 1 })),
          ),
          createTestStore(
            initial,
            rule((next) => ({ ...next, x: 2 })),
          ),
          createTestStore(
            initial,
            rule((next) => ({ ...next, y: 2 })),
          ),
        ];
        await connectPeers(backends, stores, writes);

        stores[0]!.update((s) => ({ ...s, z: 1 }));
        await ticks(40);

        expect(writes.count).toBeLessThan(7);
        for (const store of stores) expect(store.getState().z).toBe(1);
      });

      it("keeps syncing later edits after a stopped loop", async () => {
        const { backends, writes } = relayedBackends(2);
        const [a, b] = [stampingStore(), stampingStore()];
        await connectPeers(backends, [a, b], writes);

        for (const count of [1, 2, 3]) {
          writes.count = 0;
          a.update((s) => ({ ...s, count }));
          await ticks(20);

          expect(writes.count).toBeLessThan(5);
          expect(b.getState().count).toBe(count);
          expect(backends[0]!.read()).toMatchObject({ count });
          expect(backends[1]!.read()).toMatchObject({ count });
        }
      });
    });
  });

  describe("remote changes another listener hears first", () => {
    /**
     * Subscribes `react` to `backend` before the engine connects, as app code that reacts to a
     * peer's change does, so it runs before the engine's own listener. It runs once.
     */
    const listenFirst = (backend: CrdtBackend, react: () => void): void => {
      let reacted = false;
      backend.subscribe(() => {
        if (reacted) return;
        reacted = true;
        react();
      });
    };

    it("applies the remote change before the store's change, which it overrides", () => {
      const { backend } = checkedBackend(threeTodos());
      const store = createTestStore(threeTodos());
      listenFirst(backend, () => store.update((s) => toggleTodo(s, "3")));
      const onError = vi.fn();
      createSyncEngine(backend, store.adapter, { onError }).connect();
      const remote = deleteTodo(threeTodos(), "3");

      backend.receive(remote);

      expect(onError).not.toHaveBeenCalled();
      expect(store.getState()).toEqual(remote);
      expect(backend.read()).toEqual(remote);
    });

    it("keeps what the store's change did to a key it does not sync", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      listenFirst(backend, () =>
        store.update((s) => setSearchTerm(toggleTodo(s, "3"), "x")),
      );
      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "searchTerm",
      }).connect();
      const remote = {
        todos: deleteTodo(threeTodos(), "3").todos,
        filterStatus: "all",
      };

      backend.receive(remote);

      expect(store.getState()).toEqual({ ...remote, searchTerm: "x" });
      expect(backend.read()).toEqual(remote);
    });

    it("writes the store's change when the backend holds nothing new", () => {
      const { backend } = checkedBackend(threeTodos());
      const store = createTestStore(threeTodos());
      listenFirst(backend, () => store.update((s) => toggleTodo(s, "1")));
      createSyncEngine(backend, store.adapter).connect();

      backend.receive(threeTodos());

      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });

    it("reads the backend before a local change only when its revision moved", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const read = vi.spyOn(backend, "read");

      store.update((s) => toggleTodo(s, "1"));
      store.update((s) => toggleTodo(s, "2"));
      expect(read).not.toHaveBeenCalled();

      backend.receive(addTodo(threeTodos(), todo("4")));
      store.update((s) => toggleTodo(s, "4"));

      // Once, for the remote change.
      expect(read).toHaveBeenCalledTimes(1);
      expect(backend.read()).toEqual(
        toggleTodo(addTodo(threeTodos(), todo("4")), "4"),
      );
    });

    it("reads a backend without a revision before every local change", () => {
      const memory = createMemoryBackend(threeTodos());
      const backend: CrdtBackend = {
        read: () => memory.read(),
        write: (next, previous) => memory.write(next, previous),
        subscribe: (onRemoteChange) => memory.subscribe(onRemoteChange),
      };
      const store = createTestStore(threeTodos());
      listenFirst(backend, () => store.update((s) => toggleTodo(s, "3")));
      createSyncEngine(backend, store.adapter).connect();
      const read = vi.spyOn(memory, "read");

      store.update((s) => toggleTodo(s, "1"));
      store.update((s) => toggleTodo(s, "2"));
      expect(read).toHaveBeenCalledTimes(2);

      const remote = deleteTodo(memory.read() as unknown as TodoState, "3");
      memory.receive(remote);

      expect(store.getState()).toEqual(remote);
      expect(memory.read()).toEqual(remote);
    });
  });

  describe("previous state given to write", () => {
    it("passes the synced state it last wrote, so unchanged todos match by identity", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const written = store.getState();

      store.update((s) => toggleTodo(s, "1"));

      expect(previous).toHaveLength(2);
      const [, last] = previous as (typeof written)[];
      expect(last.todos[1]).toBe(written.todos[1]);
      expect(last.todos[1]).toBe(store.getState().todos[1]);
    });

    it("keeps local keys the backend holds, so the next write still deletes them", () => {
      const { backend, previous } = checkedBackend({
        ...threeTodos(),
        secret: "remote",
      });
      const store = createTestStore<object>(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "secret",
      }).connect();

      expect(store.getState()).toEqual(threeTodos());

      store.update((s) => toggleTodo(s as ReturnType<typeof threeTodos>, "1"));

      expect(previous).toEqual([{ ...threeTodos(), secret: "remote" }]);
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });

    it("passes nothing to the seed write, and what it seeded to the next one", () => {
      const { backend, previous } = checkedBackend({
        todos: [todo("remote")],
        secret: "remote",
      });
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "secret",
      }).connect();
      const seeded = { ...threeTodos(), todos: [todo("remote")] };
      expect(backend.read()).toEqual(seeded);

      store.update((s) => setSearchTerm(s, "x"));

      expect(previous).toEqual([undefined, seeded]);
    });

    it("passes what it read after a remote change, local keys included", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore<object>(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "secret",
      }).connect();
      const remote = { ...toggleTodo(threeTodos(), "2"), secret: "remote" };
      backend.receive(remote);

      store.update((s) => ({ ...s, searchTerm: "x" }));

      expect(previous.at(-1)).toEqual(remote);
      expect(backend.read()).toEqual(
        setSearchTerm(toggleTodo(threeTodos(), "2"), "x"),
      );
    });

    it("passes what it read when the store rejects a remote change", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore(threeTodos());
      const adapter = {
        ...store.adapter,
        setState: () => {
          throw new Error("invalid snapshot");
        },
      };
      createSyncEngine(backend, adapter).connect();
      const remote = addTodo(threeTodos(), todo("4"));
      expect(() => backend.receive(remote)).toThrow("invalid snapshot");

      store.update((s) => toggleTodo(s, "1"));

      expect(previous.at(-1)).toEqual(remote);
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });

    it("passes what it read when the store transforms a remote change", () => {
      const { backend, previous } = checkedBackend();
      const trimTitles = (s: ReturnType<typeof threeTodos>) => ({
        ...s,
        todos: s.todos.map((t) => ({ ...t, title: t.title.trim() })),
      });
      const store = createTestStore(threeTodos(), trimTitles);
      createSyncEngine(backend, store.adapter).connect();
      const remote = addTodo(threeTodos(), todo("4", " Todo 4 "));

      backend.receive(remote);

      // The trimmed titles are written back.
      expect(store.getState()).toEqual(addTodo(threeTodos(), todo("4")));
      expect(previous.at(-1)).toEqual(remote);
      expect(backend.read()).toEqual(addTodo(threeTodos(), todo("4")));
    });

    it("passes nothing to the write-back when the backend changed during setState", () => {
      const { backend, previous } = checkedBackend();
      const trimTitles = (s: ReturnType<typeof threeTodos>) => ({
        ...s,
        todos: s.todos.map((t) => ({ ...t, title: t.title.trim() })),
      });
      const store = createTestStore(threeTodos(), trimTitles);
      createSyncEngine(backend, store.adapter).connect();
      // Other code that changes the backend as the store changes, unheard by the engine so far,
      // as with an uncommitted Loro edit or a Yjs transaction whose observers have not run yet.
      let armed = true;
      store.adapter.subscribe(() => {
        if (!armed) return;
        armed = false;
        backend.write({ ...(backend.read() as object), filterStatus: "done" });
      });
      const remote = addTodo(threeTodos(), todo("4", " Todo 4 "));

      backend.receive(remote);

      expect(previous.at(-1)).toBeUndefined();
      expect(store.getState()).toEqual(addTodo(threeTodos(), todo("4")));
      expect(backend.read()).toEqual(addTodo(threeTodos(), todo("4")));
    });

    it("passes what it read when a remote change arrives during its own write", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const write = backend.write;
      const relayed = addTodo(toggleTodo(threeTodos(), "1"), todo("4"));
      backend.write = (next, held) => {
        write(next, held);
        backend.write = write;
        // A peer's change, relayed synchronously while the write's notifications run.
        backend.receive(relayed);
      };
      store.update((s) => toggleTodo(s, "1"));
      expect(store.getState()).toEqual(relayed);

      store.update((s) => toggleTodo(s, "2"));

      expect(previous.at(-1)).toEqual(relayed);
      expect(backend.read()).toEqual(toggleTodo(relayed, "2"));
    });

    it("passes nothing after a write that threw", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const write = backend.write;
      backend.write = () => {
        backend.write = write;
        throw new Error("boom");
      };
      expect(() => store.update((s) => toggleTodo(s, "1"))).toThrow("boom");

      store.update((s) => toggleTodo(s, "2"));

      expect(previous.at(-1)).toBeUndefined();
      expect(backend.read()).toEqual(
        toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
      );
    });

    it("passes nothing after a read that threw", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      vi.spyOn(backend, "read").mockImplementationOnce(() => {
        throw new Error("boom");
      });
      expect(() => backend.receive(addTodo(threeTodos(), todo("4")))).toThrow(
        "boom",
      );

      store.update((s) => toggleTodo(s, "1"));

      expect(previous.at(-1)).toBeUndefined();
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });
  });

  describe("untrusted key names", () => {
    it.each(prototypeMemberKeys)(
      "applies remote deletions of a %s key at any depth",
      (key) => {
        const backend = createMemoryBackend();
        const store = createTestStore<Record<string, unknown>>({
          [key]: "local",
          byName: { [key]: "local", bob: 1 },
        });
        createSyncEngine(backend, store.adapter).connect();

        backend.receive({ byName: { bob: 1 } });

        expect(Object.keys(store.getState())).toEqual(["byName"]);
        expect(Object.keys(store.getState().byName as object)).toEqual(["bob"]);
      },
    );

    it("never lets a remote __proto__ key reach the store", () => {
      const backend = createMemoryBackend();
      const store = createTestStore<Record<string, unknown>>({
        todos: [{ id: "1" }],
      });
      createSyncEngine(backend, store.adapter).connect();

      backend.receive(
        JSON.parse(
          '{"__proto__":{"isAdmin":true},' +
            '"todos":[{"id":"1","__proto__":{"isAdmin":true}},' +
            '{"id":"2","__proto__":{"isAdmin":true}}]}',
        ),
      );

      expect(JSON.stringify(store.getState())).toBe(
        '{"todos":[{"id":"1"},{"id":"2"}]}',
      );
      expect(prototypeHijacks(store.getState())).toEqual([]);
    });
  });

  describe("filter", () => {
    it("applies a custom filter in both directions", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const filter = (key: string) => key !== "searchTerm";
      createSyncEngine(backend, store.adapter, { filter }).connect();
      const { todos, filterStatus } = threeTodos();
      expect(backend.read()).toEqual({ todos, filterStatus });

      store.update((s) => setSearchTerm(s, "local"));
      expect(backend.read()).toEqual({ todos, filterStatus });

      backend.receive({
        ...toggleTodo(threeTodos(), "1"),
        searchTerm: "remote",
      });
      expect(store.getState()).toEqual({
        ...toggleTodo(threeTodos(), "1"),
        searchTerm: "local",
      });
    });
  });

  describe("disconnect", () => {
    it("stops syncing in both directions", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();

      engine.disconnect();
      store.update((s) => toggleTodo(s, "1"));
      backend.receive(addTodo(threeTodos(), todo("4")));

      expect(backend.read()).toEqual(addTodo(threeTodos(), todo("4")));
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      expect(engine.isConnected()).toBe(false);
    });

    it("is safe to call twice and to reconnect afterwards, adopting the backend", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();
      engine.disconnect();
      engine.disconnect();

      store.update((s) => toggleTodo(s, "1"));
      backend.receive(addTodo(threeTodos(), todo("4")));
      engine.connect();

      expect(engine.isConnected()).toBe(true);
      expect(store.getState()).toEqual(addTodo(threeTodos(), todo("4")));

      store.update((s) => toggleTodo(s, "2"));
      expect(backend.read()).toEqual(
        toggleTodo(addTodo(threeTodos(), todo("4")), "2"),
      );
    });
  });

  describe("schedule", () => {
    /** A scheduler that holds each flush until the test runs it. */
    const manualScheduler = () => {
      const queued: (() => void)[] = [];
      return {
        schedule: (flush: () => void) => {
          queued.push(flush);
        },
        queued: () => queued.length,
        run: () => queued.splice(0).forEach((flush) => flush()),
      };
    };

    it("applies a burst of remote changes with one read and one setState", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();
      const read = vi.spyOn(backend, "read");
      const setState = vi.spyOn(store.adapter, "setState");

      backend.receive(toggleTodo(threeTodos(), "1"));
      backend.receive(toggleTodo(toggleTodo(threeTodos(), "1"), "2"));
      backend.receive(
        addTodo(toggleTodo(toggleTodo(threeTodos(), "1"), "2"), todo("4")),
      );

      expect(store.getState()).toEqual(threeTodos());
      expect(scheduler.queued()).toBe(1);
      scheduler.run();

      expect(store.getState()).toEqual(
        addTodo(toggleTodo(toggleTodo(threeTodos(), "1"), "2"), todo("4")),
      );
      expect(read).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledTimes(1);
    });

    it("applies pending remote changes before a local change, which they override", () => {
      // Also checks that the write's `previous` is what the backend holds.
      const { backend } = checkedBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();

      const remote = addTodo(toggleTodo(threeTodos(), "1"), todo("4"));
      backend.receive(remote);
      store.update((s) => toggleTodo(s, "2"));

      expect(store.getState()).toEqual(remote);
      expect(backend.read()).toEqual(remote);
      scheduler.run();
      expect(store.getState()).toEqual(remote);
    });

    it("keeps a local change to a key it does not sync while remote changes are pending", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "searchTerm",
        schedule: scheduler.schedule,
      }).connect();

      const remote = toggleTodo(threeTodos(), "1");
      backend.receive(remote);
      store.update((s) => setSearchTerm(s, "x"));

      expect(store.getState()).toEqual(setSearchTerm(remote, "x"));
      expect(backend.read()).toMatchObject({ todos: remote.todos });
    });

    it("writes nothing back for a scheduled apply", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();
      const write = vi.spyOn(backend, "write");

      backend.receive(toggleTodo(threeTodos(), "1"));
      scheduler.run();

      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      expect(write).not.toHaveBeenCalled();
    });

    it("schedules again for a remote change after the flush", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();

      backend.receive(toggleTodo(threeTodos(), "1"));
      scheduler.run();
      backend.receive(threeTodos());

      expect(scheduler.queued()).toBe(1);
      scheduler.run();
      expect(store.getState()).toEqual(threeTodos());
    });

    it("leaves nothing for the flush once a local change applied the remote one", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();

      backend.receive(toggleTodo(threeTodos(), "1"));
      store.update((s) => setSearchTerm(s, "x"));
      const read = vi.spyOn(backend, "read");
      const setState = vi.spyOn(store.adapter, "setState");
      scheduler.run();

      expect(read).not.toHaveBeenCalled();
      expect(setState).not.toHaveBeenCalled();
    });

    it("keeps a local change once the remote change it would apply was applied already", () => {
      const { backend } = checkedBackend(threeTodos());
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      // A listener subscribed before the engine, whose change makes the engine apply the remote
      // change before its own listener schedules it.
      let armed = true;
      backend.subscribe(() => {
        if (!armed) return;
        armed = false;
        store.update((s) => toggleTodo(s, "3"));
      });
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();
      const remote = deleteTodo(threeTodos(), "3");
      backend.receive(remote);
      expect(store.getState()).toEqual(remote);

      store.update((s) => toggleTodo(s, "1"));

      expect(store.getState()).toEqual(toggleTodo(remote, "1"));
      expect(backend.read()).toEqual(toggleTodo(remote, "1"));
      scheduler.run();
      expect(store.getState()).toEqual(toggleTodo(remote, "1"));
    });

    it("applies a pending remote change on disconnect", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      const engine = createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      });
      engine.connect();

      backend.receive(toggleTodo(threeTodos(), "1"));
      engine.disconnect();

      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      const read = vi.spyOn(backend, "read");
      scheduler.run();
      expect(read).not.toHaveBeenCalled();
    });

    it("disconnects even when applying the pending remote change throws", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      const engine = createSyncEngine(
        backend,
        {
          ...store.adapter,
          setState: () => {
            throw new Error("invalid snapshot");
          },
        },
        { schedule: scheduler.schedule },
      );
      engine.connect();
      backend.receive(toggleTodo(threeTodos(), "1"));

      expect(() => engine.disconnect()).toThrow("invalid snapshot");

      expect(engine.isConnected()).toBe(false);
      const write = vi.spyOn(backend, "write");
      store.update((s) => toggleTodo(s, "2"));
      expect(write).not.toHaveBeenCalled();
    });

    it("schedules the next remote change after schedule threw", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      const schedule = vi.fn(scheduler.schedule).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      createSyncEngine(backend, store.adapter, { schedule }).connect();
      expect(() => backend.receive(toggleTodo(threeTodos(), "1"))).toThrow(
        "boom",
      );

      backend.receive(toggleTodo(threeTodos(), "2"));

      expect(scheduler.queued()).toBe(1);
      scheduler.run();
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "2"));
    });

    it("ignores a flush handed out before disconnect once connected again", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const flushes: (() => void)[] = [];
      const engine = createSyncEngine(backend, store.adapter, {
        schedule: (flush) => {
          flushes.push(flush);
        },
      });
      engine.connect();
      backend.receive(toggleTodo(threeTodos(), "1"));
      engine.disconnect();
      engine.connect();
      backend.receive(toggleTodo(threeTodos(), "2"));
      const [stale, current] = flushes;

      stale();
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      current();
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "2"));
    });

    it("applies each remote change at once when schedule runs the flush synchronously", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter, {
        schedule: (flush) => flush(),
      }).connect();

      backend.receive(toggleTodo(threeTodos(), "1"));
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      backend.receive(toggleTodo(threeTodos(), "2"));
      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "2"));
    });
  });

  describe("onError", () => {
    it("reports a setState that throws on a remote change, instead of throwing to the backend's notifier", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const invalid = new Error("invalid snapshot");
      const onError = vi.fn();
      const engine = createSyncEngine(
        backend,
        {
          ...store.adapter,
          setState: () => {
            throw invalid;
          },
        },
        { onError },
      );
      engine.connect();

      expect(() =>
        backend.receive(toggleTodo(threeTodos(), "1")),
      ).not.toThrow();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(invalid, "store");
      expect(engine.isConnected()).toBe(true);
    });

    it("reports a write that throws on a local change, instead of throwing to the store's notifier", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const onError = vi.fn();
      createSyncEngine(backend, store.adapter, { onError }).connect();
      const offline = new Error("offline");
      vi.spyOn(backend, "write").mockImplementationOnce(() => {
        throw offline;
      });

      expect(() => store.update((s) => toggleTodo(s, "1"))).not.toThrow();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(offline, "backend");
      store.update((s) => toggleTodo(s, "2"));
      expect(backend.read()).toEqual(
        toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
      );
    });

    it("writes the next local change after reporting a setState that threw", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const onError = vi.fn();
      createSyncEngine(backend, store.adapter, { onError }).connect();
      vi.spyOn(store.adapter, "setState").mockImplementationOnce(() => {
        throw new Error("invalid snapshot");
      });
      backend.receive(addTodo(threeTodos(), todo("4")));

      store.update((s) => toggleTodo(s, "1"));

      expect(onError).toHaveBeenCalledTimes(1);
      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
    });

    it("reports a write back that throws after a remote change", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(
        { todos: [] as string[], count: 0 },
        (s) => ({
          ...s,
          count: s.todos.length,
        }),
      );
      const onError = vi.fn();
      createSyncEngine(backend, store.adapter, { onError }).connect();
      const offline = new Error("offline");
      vi.spyOn(backend, "write").mockImplementationOnce(() => {
        throw offline;
      });

      expect(() => backend.receive({ todos: ["a"], count: 0 })).not.toThrow();

      expect(onError).toHaveBeenCalledWith(offline, "backend");
      expect(store.getState()).toEqual({ todos: ["a"], count: 1 });
    });

    it("reports a read that throws on a remote change", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const onError = vi.fn();
      createSyncEngine(backend, store.adapter, { onError }).connect();
      const corrupt = new Error("corrupt document");
      vi.spyOn(backend, "read").mockImplementationOnce(() => {
        throw corrupt;
      });

      expect(() => backend.receive(threeTodos())).not.toThrow();

      expect(onError).toHaveBeenCalledWith(corrupt, "backend");
    });

    it("still throws from connect, without reporting", () => {
      const backend = createMemoryBackend(toggleTodo(threeTodos(), "1"));
      const store = createTestStore(threeTodos());
      const onError = vi.fn();
      const engine = createSyncEngine(
        backend,
        {
          ...store.adapter,
          setState: () => {
            throw new Error("invalid snapshot");
          },
        },
        { onError },
      );

      expect(() => engine.connect()).toThrow("invalid snapshot");

      expect(onError).not.toHaveBeenCalled();
      expect(engine.isConnected()).toBe(false);
    });

    it("throws to the backend's notifier without onError, and stays connected", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, {
        ...store.adapter,
        setState: () => {
          throw new Error("invalid snapshot");
        },
      });
      engine.connect();

      expect(() => backend.receive(toggleTodo(threeTodos(), "1"))).toThrow(
        "invalid snapshot",
      );

      expect(engine.isConnected()).toBe(true);
    });

    describe("with schedule", () => {
      const throwingSetState = (onError: () => void) => {
        const backend = createMemoryBackend();
        const store = createTestStore(threeTodos());
        const flushes: (() => void)[] = [];
        const invalid = new Error("invalid snapshot");
        const engine = createSyncEngine(
          backend,
          {
            ...store.adapter,
            setState: () => {
              throw invalid;
            },
          },
          {
            onError,
            schedule: (flush) => {
              flushes.push(flush);
            },
          },
        );
        engine.connect();
        backend.receive(toggleTodo(threeTodos(), "1"));
        return { engine, flushes, invalid };
      };

      it("reports an apply that throws in the flush, instead of throwing to the scheduler", () => {
        const onError = vi.fn();
        const { flushes, invalid } = throwingSetState(onError);

        expect(() => flushes[0]!()).not.toThrow();

        expect(onError).toHaveBeenCalledWith(invalid, "store");
      });

      it("reports a pending apply that throws on disconnect, and disconnects", () => {
        const onError = vi.fn();
        const { engine, invalid } = throwingSetState(onError);

        expect(() => engine.disconnect()).not.toThrow();

        expect(onError).toHaveBeenCalledWith(invalid, "store");
        expect(engine.isConnected()).toBe(false);
      });
    });
  });

  describe("broken contracts", () => {
    it.each([
      ["a string", "string"],
      [null, "null"],
      [undefined, "undefined"],
      [[1, 2], "array"],
    ])(
      "throws from connect, without seeding, when read() returns %j",
      (held, kind) => {
        const backend = createMemoryBackend();
        // A backend that breaks its contract, which the types rule out.
        vi.spyOn(backend, "read").mockReturnValue(held as never);
        const write = vi.spyOn(backend, "write");
        const store = createTestStore(threeTodos());
        const engine = createSyncEngine(backend, store.adapter);

        expect(() => engine.connect()).toThrow(
          new TypeError(
            `CrdtBackend.read() must return a plain object, got ${kind}`,
          ),
        );

        expect(write).not.toHaveBeenCalled();
        expect(engine.isConnected()).toBe(false);
      },
    );

    it("throws from connect when getState() returns undefined", () => {
      const backend = createMemoryBackend();
      const engine = createSyncEngine(backend, {
        getState: () => undefined as unknown as object,
        setState: () => {},
        subscribe: () => () => {},
      });

      expect(() => engine.connect()).toThrow(
        new TypeError(
          "StoreAdapter.getState() must return an object, got undefined",
        ),
      );
    });

    const noObject = new TypeError(
      "CrdtBackend.read() must return a plain object, got null",
    );

    it("reports a backend that comes to hold no object, and leaves the store alone", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const onError = vi.fn();
      createSyncEngine(backend, store.adapter, { onError }).connect();

      backend.receive(null as never);

      expect(onError).toHaveBeenCalledWith(noObject, "backend");
      expect(store.getState()).toEqual(threeTodos());
    });

    it("throws to the backend's notifier when it comes to hold no object without onError", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();

      expect(() => backend.receive(null as never)).toThrow(noObject);

      expect(store.getState()).toEqual(threeTodos());
    });

    it("reports a store whose getState() comes to return undefined", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      let broken = false;
      const onError = vi.fn();
      createSyncEngine(
        backend,
        {
          ...store.adapter,
          getState: () =>
            broken ? (undefined as unknown as TodoState) : store.getState(),
        },
        { onError },
      ).connect();
      broken = true;

      store.update((s) => toggleTodo(s, "1"));

      expect(onError).toHaveBeenCalledWith(
        new TypeError(
          "StoreAdapter.getState() must return an object, got undefined",
        ),
        "store",
      );
      expect(backend.read()).toEqual(threeTodos());
    });
  });

  describe("failed connect", () => {
    /** Wraps `target.subscribe` and returns how many of its listeners are still attached. */
    const trackSubscriptions = (target: {
      subscribe: (listener: () => void) => () => void;
    }): (() => number) => {
      const subscribe = target.subscribe;
      let active = 0;
      target.subscribe = (listener) => {
        const unsubscribe = subscribe(listener);
        active += 1;
        return () => {
          active -= 1;
          unsubscribe();
        };
      };
      return () => active;
    };

    it("removes the backend listener when the adapter subscription throws", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ a: 1 });
      const setState = vi.fn();
      const engine = createSyncEngine(backend, {
        ...store.adapter,
        setState,
        subscribe: () => {
          throw new Error("boom");
        },
      });

      expect(() => engine.connect()).toThrow("boom");
      engine.disconnect();
      backend.receive({ a: 2 });

      expect(setState).not.toHaveBeenCalled();
      expect(engine.isConnected()).toBe(false);
    });

    it("leaves no adapter subscription when the backend subscription throws", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const storeSubscriptions = trackSubscriptions(store.adapter);
      backend.subscribe = () => {
        throw new Error("boom");
      };
      const engine = createSyncEngine(backend, store.adapter);

      expect(() => engine.connect()).toThrow("boom");

      expect(storeSubscriptions()).toBe(0);
      expect(engine.isConnected()).toBe(false);
    });

    it("leaves no subscriptions when seeding the backend throws", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const backendSubscriptions = trackSubscriptions(backend);
      const storeSubscriptions = trackSubscriptions(store.adapter);
      vi.spyOn(backend, "write").mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const engine = createSyncEngine(backend, store.adapter);

      expect(() => engine.connect()).toThrow("boom");

      expect(backendSubscriptions()).toBe(0);
      expect(storeSubscriptions()).toBe(0);
      expect(engine.isConnected()).toBe(false);
    });

    it("subscribes once to each side when connecting again", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const backendSubscriptions = trackSubscriptions(backend);
      const storeSubscriptions = trackSubscriptions(store.adapter);
      vi.spyOn(store.adapter, "subscribe").mockImplementationOnce(() => {
        throw new Error("boom");
      });
      const engine = createSyncEngine(backend, store.adapter);

      expect(() => engine.connect()).toThrow("boom");
      engine.connect();

      expect(backendSubscriptions()).toBe(1);
      expect(storeSubscriptions()).toBe(1);
      expect(engine.isConnected()).toBe(true);
    });
  });
});
