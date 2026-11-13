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
  type JsonObject,
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
  renameTodo,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  toggleTodo,
  type TestStore,
  type TodoState,
} from "./helpers.js";
import type { SyncEngine, SyncEvent } from "../index.js";

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

    it("seeds a backend that holds only keys the filter excludes, and keeps them", () => {
      const backend = createMemoryBackend({ secret: "remote" });
      const store = createTestStore(threeTodos());

      createSyncEngine(backend, store.adapter, {
        filter: (key: string) => key !== "secret",
      }).connect();

      expect(store.getState()).toEqual(threeTodos());
      expect(backend.read()).toEqual({ ...threeTodos(), secret: "remote" });
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

    describe("in a part the remote change left alone", () => {
      type Card = { title: string; done: boolean };
      interface Board {
        cards: Record<string, Card>;
      }

      const board = (): Board => ({
        cards: {
          a: { title: "a", done: false },
          b: { title: "b", done: false },
          c: { title: "c", done: false },
        },
      });

      const withCard = (state: Board, id: string, card: Partial<Card>) => ({
        ...state,
        cards: { ...state.cards, [id]: { ...state.cards[id]!, ...card } },
      });

      it("writes back a card the store changes when a remote change marks another one done", () => {
        const { backend } = checkedBackend(board());
        // Card `c` follows card `a`.
        const store = createTestStore(board(), (next) =>
          next.cards.c!.done === next.cards.a!.done
            ? next
            : withCard(next, "c", { done: next.cards.a!.done }),
        );
        const before = store.getState();
        createSyncEngine(backend, store.adapter).connect();
        const write = vi.spyOn(backend, "write");

        backend.receive(withCard(board(), "a", { done: true }));

        const marked = withCard(withCard(board(), "a", { done: true }), "c", {
          done: true,
        });
        expect(store.getState()).toEqual(marked);
        expect(store.getState().cards.b).toBe(before.cards.b);
        expect(write).toHaveBeenCalledTimes(1);
        expect(backend.read()).toEqual(marked);
      });

      it("stops writing back the one path a peer keeps re-writing", () => {
        const onError = vi.fn();
        const { backend } = checkedBackend(board());
        // Card `c`'s title is kept in upper case.
        const store = createTestStore(board(), (next) =>
          withCard(next, "c", { title: next.cards.c!.title.toUpperCase() }),
        );
        createSyncEngine(backend, store.adapter, { onError }).connect();

        // Each remote change toggles card `a` and holds card `c`'s title in lower case again.
        for (let i = 1; i <= 7; i++)
          backend.receive(withCard(board(), "a", { done: i % 2 === 1 }));

        expect(onError).toHaveBeenCalledTimes(1);
        const [error] = onError.mock.calls[0]!;
        expect(error).toBeInstanceOf(WriteLoopError);
        expect((error as Error).message).toContain(
          'stopped writing back ["cards","c","title"]:',
        );
        expect(store.getState()).toEqual(
          withCard(withCard(board(), "a", { done: true }), "c", { title: "C" }),
        );
      });

      it("shares the store's cards with the next local write once that path is stopped", () => {
        const { backend, previous } = checkedBackend(board());
        const store = createTestStore(board(), (next) =>
          withCard(next, "c", { title: next.cards.c!.title.toUpperCase() }),
        );
        createSyncEngine(backend, store.adapter, {
          onError: () => {},
        }).connect();
        for (let i = 1; i <= 7; i++)
          backend.receive(withCard(board(), "a", { done: i % 2 === 1 }));
        // The last apply wrote nothing back.
        expect(backend.read()).toEqual(withCard(board(), "a", { done: true }));
        const applied = store.getState();

        store.update((s) => withCard(s, "b", { done: true }));

        const last = previous.at(-1) as Board;
        expect(last.cards.a).toBe(applied.cards.a);
        expect(last.cards.a).toBe(store.getState().cards.a);
        expect(backend.read()).toEqual(store.getState());
      });
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

      it("writes the local change and what the store derives once when a local change runs the pending apply", () => {
        const { backend, previous } = checkedBackend();
        const { store } = connectScheduled(backend, normalisingStore());
        const write = vi.spyOn(backend, "write");

        backend.receive({ todos: ["a", "b"], count: 0 });
        store.update((s) => ({ ...s, todos: [...s.todos, "local"] }));

        const merged = { todos: ["a", "b", "local"], count: 3 };
        expect(store.getState()).toEqual(merged);
        expect(backend.read()).toEqual(merged);
        expect(write).toHaveBeenCalledTimes(1);
        expect(previous.at(-1)).toEqual({ todos: ["a", "b"], count: 0 });
      });

      it("writes nothing when a local change that matches the pending apply needs no derived write", () => {
        const backend = createMemoryBackend();
        const { store } = connectScheduled(backend, normalisingStore());
        const write = vi.spyOn(backend, "write");

        backend.receive({ todos: ["a", "b"], count: 2 });
        store.update((s) => ({ ...s, todos: ["a", "b"] }));

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

        expect(writes.count).toBeLessThan(14);
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

        expect(writes.count).toBeLessThan(14);
        expect(atLeastTen.getState().todos).toEqual(["a"]);
        expect(atMostFive.getState().todos).toEqual(["a"]);
      });

      /** One stamping peer whose write back another peer re-stamps six times in a row. */
      const restampWriteBack = (config?: SyncEngineConfig<Stamped>) => {
        rulesOn = true;
        const backend = createMemoryBackend();
        const store = stampingStore();
        createSyncEngine(backend, store.adapter, config).connect();
        const write = vi.spyOn(backend, "write");

        backend.receive({ count: 1, updatedAt: 0 });
        expect(write).toHaveBeenCalledTimes(1);
        const stamped = (backend.read() as unknown as Stamped).updatedAt!;

        for (let i = 1; i <= 6; i++)
          backend.receive({ count: 1, updatedAt: -i });
        return { backend, store, write, stamped };
      };

      it("stops writing back and reports the keys once when a peer re-writes them", () => {
        const { backend, store, write, stamped } = restampWriteBack();

        // The write back, then one for each re-stamp before the sixth in a row.
        expect(write).toHaveBeenCalledTimes(6);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('"updatedAt"');
        expect(warn.mock.calls[0]![0]).not.toContain('"count"');
        // The store keeps its own stamp, and the backend the peer's.
        expect(store.getState().updatedAt).toBeGreaterThan(stamped);
        expect(backend.read()).toEqual({ count: 1, updatedAt: -6 });
      });

      it("starts the count again when a local change is merged into a pending apply", () => {
        rulesOn = true;
        const backend = createMemoryBackend();
        const store = stampingStore();
        const flushes: (() => void)[] = [];
        createSyncEngine(backend, store.adapter, {
          schedule: (flush) => flushes.push(flush),
        }).connect();
        const receive = (state: Stamped) => {
          backend.receive(state);
          flushes.splice(0).forEach((flush) => flush());
        };
        receive({ count: 1, updatedAt: 0 });
        // Five re-stamps in a row: one short of the threshold.
        for (let i = 1; i <= 5; i++) receive({ count: 1, updatedAt: -i });

        // A re-stamp, and a local change merged into its apply and written.
        backend.receive({ count: 1, updatedAt: -6 });
        store.update((s) => ({ ...s, count: 2 }));
        expect(backend.read()).toMatchObject({ count: 2 });

        // A written local change starts the count again, so six more re-stamps do not stop it.
        for (let i = 7; i <= 12; i++) receive({ count: 2, updatedAt: -i });
        expect(warn).not.toHaveBeenCalled();
        receive({ count: 2, updatedAt: -13 });
        expect(warn).toHaveBeenCalledTimes(1);
      });

      it("stops a loop without a warning in production", () => {
        vi.stubEnv("NODE_ENV", "production");
        try {
          const { write } = restampWriteBack();

          expect(write).toHaveBeenCalledTimes(6);
          expect(warn).not.toHaveBeenCalled();
        } finally {
          vi.unstubAllEnvs();
        }
      });

      it("reports a stopped loop to onError once, naming its keys, instead of warning", () => {
        const onError = vi.fn();
        const { backend } = restampWriteBack({ onError });
        backend.receive({ count: 1, updatedAt: -7 });

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

        expect(writes.count).toBeLessThan(21);
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

        expect(writes.count).toBeLessThan(23);
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

          expect(writes.count).toBeLessThan(14);
          expect(b.getState().count).toBe(count);
          expect(backends[0]!.read()).toMatchObject({ count });
          expect(backends[1]!.read()).toMatchObject({ count });
        }
      });

      describe("while other peers write concurrently", () => {
        interface Seen {
          items: number[];
          seenBy: Record<string, number>;
        }

        /** A store whose subscriber records, under `name`'s own entry, how many items it has seen. */
        const seeingStore = (name: string, initial: Seen) => {
          const store = createTestStore<Seen>(initial);
          store.adapter.subscribe(() => {
            const s = store.getState();
            if (s.seenBy[name] !== s.items.length)
              store.setState({
                ...s,
                seenBy: { ...s.seenBy, [name]: s.items.length },
              });
          });
          return store;
        };

        interface Logged {
          log: string[];
          logSize: number;
        }

        /** A store whose subscriber derives `logSize` from `log`. */
        const loggingStore = (initial: Logged) => {
          const store = createTestStore<Logged>(initial);
          store.adapter.subscribe(() => {
            const s = store.getState();
            if (s.logSize !== s.log.length)
              store.setState({ ...s, logSize: s.log.length });
          });
          return store;
        };

        it("keeps writing back a peer's own entry while other peers change theirs", () => {
          const backend = createMemoryBackend();
          const store = seeingStore("p2", { items: [], seenBy: { p2: 0 } });
          const onError = vi.fn();
          createSyncEngine(backend, store.adapter, { onError }).connect();

          backend.receive({ items: [1], seenBy: { p0: 1, p2: 0 } }); // p2 writes back p2: 1
          // p0 has received that write back, appends, and updates its own entry.
          backend.receive({ items: [1, 2], seenBy: { p0: 2, p2: 1 } });
          backend.receive({ items: [1, 2, 3], seenBy: { p0: 3, p2: 1 } });

          expect(onError).not.toHaveBeenCalled();
          expect(store.getState().seenBy.p2).toBe(3);
          expect(backend.read()).toEqual(store.getState());
        });

        it("reports no loop when a concurrent write wins over a derived key", () => {
          const backend = createMemoryBackend();
          const store = loggingStore({ log: ["a"], logSize: 1 });
          const onError = vi.fn();
          const engine = createSyncEngine(backend, store.adapter, { onError });
          engine.connect();
          const failures: unknown[] = [];
          engine.subscribeStatus(() =>
            failures.push(engine.getStatus().failure),
          );

          backend.receive({ log: ["a", "b"], logSize: 1 }); // B's append; A writes back logSize: 2
          // C appended concurrently and wrote logSize: 1, which wins over A's 2.
          backend.receive({ log: ["a", "b", "c"], logSize: 1 });

          expect(onError).not.toHaveBeenCalled();
          expect(engine.getStatus().failure).toBeNull();
          expect(failures.every((failure) => failure === null)).toBe(true);
          expect(backend.read()).toEqual({ log: ["a", "b", "c"], logSize: 3 });
        });

        it("writes back a stopped key again once the remote state stops contradicting it", () => {
          const backend = createMemoryBackend();
          const store = loggingStore({ log: [], logSize: 0 });
          const onError = vi.fn();
          const engine = createSyncEngine(backend, store.adapter, { onError });
          engine.connect();

          // Another peer keeps appending and putting back logSize: 0, as a stuck peer would.
          const log: string[] = [];
          for (const item of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
            log.push(item);
            backend.receive({ log: [...log], logSize: 0 });
          }
          expect(onError).toHaveBeenCalledWith(
            expect.any(WriteLoopError),
            "store",
          );
          expect(backend.read()).toEqual({ log, logSize: 0 });
          expect(store.getState().logSize).toBe(8);

          // The other peer now writes what this store derived, and appends again.
          backend.receive({ log: [...log, "i"], logSize: 8 });

          expect(backend.read()).toEqual({ log: [...log, "i"], logSize: 9 });
          expect(engine.getStatus().failure).toBeNull();
        });

        it("keeps writing back a peer's own entry however long other peers change theirs", () => {
          // Paths are compared under a key: another peer's entry is no contradiction.
          const backend = createMemoryBackend();
          const store = seeingStore("p1", { items: [], seenBy: {} });
          const onError = vi.fn();
          createSyncEngine(backend, store.adapter, { onError }).connect();

          for (let i = 1; i <= 6; i++) {
            const items = Array.from({ length: i }, (_, j) => j);
            backend.receive({ items, seenBy: { p0: i * 10, p1: i - 1 } });
          }

          expect(onError).not.toHaveBeenCalled();
          expect(backend.read()).toEqual({
            items: [0, 1, 2, 3, 4, 5],
            seenBy: { p0: 60, p1: 6 },
          });
        });

        /**
         * Memory backends whose writes reach every other one asynchronously and merge there as a
         * CRDT map would: each value the write changed is set at its path, and an array grows to
         * the sorted union of both, so concurrent appends of distinct numbers converge.
         */
        const mergingBackends = (count: number) => {
          const backends = Array.from({ length: count }, () =>
            createMemoryBackend(),
          );
          type Entries = [string[], unknown][];
          const changes = (a: unknown, b: unknown, at: string[]): Entries => {
            if (JSON.stringify(a) === JSON.stringify(b)) return [];
            const record = (value: unknown) =>
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value);
            if (!record(a) || !record(b)) return [[at, b]];
            const x = a as Record<string, unknown>;
            const y = b as Record<string, unknown>;
            return Object.keys(y).flatMap((key) =>
              changes(x[key], y[key], [...at, key]),
            );
          };
          const merge = (state: unknown, path: string[], value: unknown) => {
            const [key, ...rest] = path;
            const target = state as Record<string, unknown>;
            if (rest.length > 0) {
              target[key!] ??= {};
              merge(target[key!], rest, value);
            } else if (Array.isArray(value) && Array.isArray(target[key!]))
              target[key!] = [
                ...new Set([...(target[key!] as number[]), ...value]),
              ].sort((m, n) => m - n);
            else target[key!] = value;
          };
          for (const from of backends) {
            const write = from.write;
            from.write = (next, previous) => {
              const sent = changes(from.read(), snapshot(next), []);
              write(next, previous);
              for (const to of backends)
                if (to !== from)
                  setTimeout(() => {
                    const state = to.read();
                    for (const [path, value] of sent) merge(state, path, value);
                    to.receive(state);
                  }, 0);
            };
          }
          return backends;
        };

        it("syncs three peers that each append concurrently and write their own entry", async () => {
          const backends = mergingBackends(3);
          const names = ["p0", "p1", "p2"];
          const stores = names.map((name) =>
            seeingStore(name, { items: [], seenBy: {} }),
          );
          const onError = vi.fn();
          backends.forEach((backend, i) =>
            createSyncEngine(backend, stores[i]!.adapter, {
              onError,
            }).connect(),
          );
          await ticks(10);

          for (let round = 0; round < 5; round++) {
            stores.forEach((store, i) =>
              store.update((s) => ({
                ...s,
                items: [...s.items, round * 10 + i],
              })),
            );
            await ticks(2);
          }
          await ticks(40);

          expect(onError).not.toHaveBeenCalled();
          const state = backends[0]!.read();
          for (const [i, store] of stores.entries()) {
            expect(store.getState()).toEqual(state);
            expect(backends[i]!.read()).toEqual(state);
          }
          for (const name of names)
            expect((state as unknown as Seen).seenBy[name]).toBe(
              (state as unknown as Seen).items.length,
            );
        });
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

    it.each([
      ["without schedule", {}],
      ["with schedule", { schedule: () => {} }],
    ] as [string, SyncEngineConfig<TodoState>][])(
      "merges the store's change with the remote change, %s",
      (_, config) => {
        const { backend, previous } = checkedBackend(threeTodos());
        const store = createTestStore(threeTodos());
        listenFirst(backend, () => store.update((s) => toggleTodo(s, "1")));
        createSyncEngine(backend, store.adapter, config).connect();
        const write = vi.spyOn(backend, "write");
        const remote = deleteTodo(threeTodos(), "3");

        backend.receive(remote);

        const both = toggleTodo(remote, "1");
        expect(store.getState()).toEqual(both);
        expect(backend.read()).toEqual(both);
        expect(write).toHaveBeenCalledTimes(1);
        expect(previous.at(-1)).toEqual(remote);
      },
    );

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

    it("passes the store's unchanged todos after a remote change, so they match by identity", () => {
      const { backend, previous } = checkedBackend(threeTodos());
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();

      backend.receive(toggleTodo(threeTodos(), "1"));
      const applied = store.getState();
      store.update((s) => toggleTodo(s, "2"));

      const last = previous.at(-1) as TodoState;
      expect(last.todos[0]).toBe(applied.todos[0]);
      expect(last.todos[2]).toBe(applied.todos[2]);
      expect(last.todos[2]).toBe(store.getState().todos[2]);
      expect(backend.read()).toEqual(
        toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
      );
    });

    it("passes the store's todos after a remote change the store already held", () => {
      const { backend, previous } = checkedBackend(threeTodos());
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      const held = store.getState();

      backend.receive(threeTodos());
      store.update((s) => toggleTodo(s, "2"));

      const last = previous.at(-1) as TodoState;
      expect(last.todos[0]).toBe(held.todos[0]);
      expect(last.todos[2]).toBe(store.getState().todos[2]);
    });

    describe("to the write-back of a key the store changes during a remote change", () => {
      type Counted = TodoState & { done: number };

      const counted = (): Counted => ({ ...threeTodos(), done: 0 });

      /** `state` with `done` counting its completed todos. */
      const withDone = (state: Counted): Counted => ({
        ...state,
        done: state.todos.filter((t) => t.completed).length,
      });

      /** A remote change that toggles todo `1` and leaves `done` as the backend holds it. */
      const toggledRemotely = (): Counted => ({
        ...toggleTodo(counted(), "1"),
        done: 0,
      });

      /** A store with a subscriber that keeps `done` in step with `todos`. */
      const subscriberStore = () => {
        const store = createTestStore(counted());
        store.adapter.subscribe(() => {
          const state = store.getState();
          const next = withDone(state);
          if (next.done !== state.done) store.setState(next);
        });
        return store;
      };

      it.each([
        ["setState derives", () => createTestStore(counted(), withDone)],
        ["a subscriber derives", subscriberStore],
      ])(
        "shares the todos the store kept when %s the key",
        (_, createStore) => {
          const { backend, previous } = checkedBackend(counted());
          const store = createStore();
          createSyncEngine(backend, store.adapter).connect();
          const write = vi.spyOn(backend, "write");

          backend.receive(toggledRemotely());

          expect(write).toHaveBeenCalledTimes(1);
          const last = previous.at(-1) as Counted;
          expect(last.todos).toBe(store.getState().todos);
          expect(store.getState().done).toBe(1);
          expect(backend.read()).toEqual(store.getState());
        },
      );

      it("shares the store's copies when setState keeps copies of what it is given", () => {
        const { backend, previous } = checkedBackend(counted());
        const store = createTestStore(counted(), (next) =>
          withDone(snapshot(next)),
        );
        createSyncEngine(backend, store.adapter).connect();

        backend.receive(toggledRemotely());

        const last = previous.at(-1) as Counted;
        expect(last.todos).toBe(store.getState().todos);
        expect(backend.read()).toEqual(store.getState());
      });

      it("shares the todos the store kept in the key it changed", () => {
        const { backend, previous } = checkedBackend(threeTodos());
        // Trims a title only when it needs trimming, keeping every other todo.
        const store = createTestStore(threeTodos(), (next) => ({
          ...next,
          todos: next.todos.map((t) =>
            t.title === t.title.trim() ? t : { ...t, title: t.title.trim() },
          ),
        }));
        createSyncEngine(backend, store.adapter).connect();

        backend.receive(addTodo(threeTodos(), todo("4", " Todo 4 ")));

        const last = previous.at(-1) as TodoState;
        const state = store.getState();
        expect(state).toEqual(addTodo(threeTodos(), todo("4")));
        expect(last.todos[0]).toBe(state.todos[0]);
        expect(last.todos[2]).toBe(state.todos[2]);
        expect(backend.read()).toEqual(state);
      });

      it("passes what the backend holds for a key whose remote value the filter rejects", () => {
        const notLocal = (_key: string, value: unknown) =>
          !(typeof value === "string" && value.startsWith("local:"));
        const { backend, previous } = checkedBackend(counted());
        const store = createTestStore(counted(), withDone);
        createSyncEngine(backend, store.adapter, {
          filter: notLocal,
        }).connect();

        backend.receive({ ...toggledRemotely(), searchTerm: "local:x" });

        const last = previous.at(-1) as Counted;
        expect(last.searchTerm).toBe("local:x");
        expect(last.todos).toBe(store.getState().todos);
        expect(backend.read()).toEqual(store.getState());
      });
    });

    it("passes what the backend holds for a key whose remote value the filter rejects", () => {
      const notLocal = (_key: string, value: unknown) =>
        !(typeof value === "string" && value.startsWith("local:"));
      const { backend, previous } = checkedBackend({
        todos: ["a"],
        view: "list",
      });
      const store = createTestStore({ todos: ["a"], view: "list" });
      createSyncEngine(backend, store.adapter, { filter: notLocal }).connect();

      backend.receive({ todos: ["b"], view: "local:grid" });
      store.update((s) => ({ ...s, todos: ["c"] }));

      expect(previous.at(-1)).toEqual({ todos: ["b"], view: "local:grid" });
      expect(backend.read()).toEqual({ todos: ["c"], view: "list" });
    });

    it("passes what the backend holds after a remote change applied while the store took another", () => {
      const { backend, previous } = checkedBackend({
        ...threeTodos(),
        secret: "a",
      });
      const store = createTestStore<object>(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key: string) => key !== "secret",
      }).connect();
      // A peer changes `secret` as soon as the store takes the next remote change.
      let peerChanged = false;
      store.adapter.subscribe(() => {
        if (peerChanged) return;
        peerChanged = true;
        backend.receive({ ...toggleTodo(threeTodos(), "1"), secret: "b" });
      });

      backend.receive({ ...toggleTodo(threeTodos(), "1"), secret: "a" });
      store.update((s) => toggleTodo(s as TodoState, "2"));

      expect(previous.at(-1)).toEqual({
        ...toggleTodo(threeTodos(), "1"),
        secret: "b",
      });
      expect(backend.read()).toEqual({
        ...toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
        secret: "b",
      });
    });

    it("keeps local keys the backend holds, and the next write leaves them", () => {
      const { backend, previous } = checkedBackend({
        ...threeTodos(),
        secret: "remote",
      });
      const store = createTestStore<object>(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key: string) => key !== "secret",
      }).connect();

      expect(store.getState()).toEqual(threeTodos());

      store.update((s) => toggleTodo(s as ReturnType<typeof threeTodos>, "1"));

      expect(previous).toEqual([{ ...threeTodos(), secret: "remote" }]);
      expect(backend.read()).toEqual({
        ...toggleTodo(threeTodos(), "1"),
        secret: "remote",
      });
    });

    it("passes what it read to the seed write, and what it seeded to the next one", () => {
      const held = { todos: [todo("remote")], secret: "remote" };
      const { backend, previous } = checkedBackend(held);
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key: string) => key !== "secret",
      }).connect();
      const seeded = {
        ...threeTodos(),
        todos: [todo("remote")],
        secret: "remote",
      };
      expect(backend.read()).toEqual(seeded);

      store.update((s) => setSearchTerm(s, "x"));

      expect(previous).toEqual([held, seeded]);
    });

    it("passes what it read after a remote change, local keys included", () => {
      const { backend, previous } = checkedBackend();
      const store = createTestStore<object>(threeTodos());
      createSyncEngine(backend, store.adapter, {
        filter: (key: string) => key !== "secret",
      }).connect();
      const remote = { ...toggleTodo(threeTodos(), "2"), secret: "remote" };
      backend.receive(remote);

      store.update((s) => ({ ...s, searchTerm: "x" }));

      expect(previous.at(-1)).toEqual(remote);
      expect(backend.read()).toEqual({
        ...setSearchTerm(toggleTodo(threeTodos(), "2"), "x"),
        secret: "remote",
      });
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

    it.each(["connect", "a remote change"])(
      "copies a remote object with another prototype into a plain object on %s, at any depth",
      (when) => {
        // What a backend that builds objects by assignment reads from a peer's `__proto__` entry.
        const hijacked = <T extends object>(entries: T): T =>
          Object.assign(Object.create({ isAdmin: true }) as T, entries);
        const backend = createMemoryBackend();
        const read = (): JsonObject =>
          hijacked({
            todos: [
              { id: "1" },
              hijacked({ id: "2", tags: [hijacked({ name: "a" })] }),
            ],
            settings: hijacked({ layout: hijacked({ width: 2 }) }),
          });
        const store = createTestStore<Record<string, unknown>>({
          todos: [{ id: "1" }],
        });
        const engine = createSyncEngine(
          when === "connect" ? { ...backend, read } : backend,
          store.adapter,
        );
        engine.connect();

        if (when !== "connect") {
          backend.read = read;
          backend.receive({});
        }

        expect(store.getState()).toEqual({
          todos: [{ id: "1" }, { id: "2", tags: [{ name: "a" }] }],
          settings: { layout: { width: 2 } },
        });
        expect(prototypeHijacks(store.getState())).toEqual([]);
      },
    );
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

    it("keeps a store's function when a remote value arrives under its key", () => {
      const addTodo = () => {};
      const backend = createMemoryBackend();
      const store = createTestStore({ todos: [] as string[], addTodo });
      createSyncEngine(backend, store.adapter).connect();

      backend.receive({ todos: ["a"], addTodo: "oops" });

      expect(store.getState()).toEqual({ todos: ["a"], addTodo });
      expect(backend.read()).toEqual({ todos: ["a"], addTodo: "oops" });
    });

    /** Keeps every value but a string starting with `local:`, whatever the key. */
    const notLocal = (_key: string, value: unknown) =>
      !(typeof value === "string" && value.startsWith("local:"));

    it("keeps a store value a custom filter rejects when a value it keeps arrives", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({
        todos: [] as string[],
        view: "local:list",
      });
      createSyncEngine(backend, store.adapter, { filter: notLocal }).connect();
      expect(backend.read()).toEqual({ todos: [] });

      backend.receive({ todos: ["a"], view: "grid" });

      expect(store.getState()).toEqual({ todos: ["a"], view: "local:list" });
      expect(backend.read()).toEqual({ todos: ["a"], view: "grid" });
    });

    it("leaves a key the store does not sync in the room through later local writes", () => {
      const addTodo = () => {};
      const backend = createMemoryBackend();
      const store = createTestStore({ todos: [] as string[], addTodo });
      createSyncEngine(backend, store.adapter).connect();
      backend.receive({ todos: [], addTodo: "oops" });
      const write = vi.spyOn(backend, "write");

      backend.receive({ todos: [], addTodo: "again" });
      expect(write).not.toHaveBeenCalled();

      store.update((s) => ({ ...s, todos: ["local"] }));
      expect(store.getState()).toEqual({ todos: ["local"], addTodo });
      expect(backend.read()).toEqual({ todos: ["local"], addTodo: "again" });
    });

    it.each([
      ["seed 'if-empty'", {}],
      ["seed 'never'", { seed: "never" }],
    ] as [
      string,
      SyncEngineConfig<{ todos: string[]; addTodo: () => void }>,
    ][])(
      "keeps a store's function on connect when the backend holds a value under its key, with %s",
      (_, config) => {
        const addTodo = () => {};
        const backend = createMemoryBackend({ addTodo: "oops" });
        const store = createTestStore({ todos: ["a"], addTodo });

        createSyncEngine(backend, store.adapter, config).connect();

        expect(store.getState()).toEqual({ todos: ["a"], addTodo });
        expect(backend.read()).toEqual(
          config.seed === "never"
            ? { addTodo: "oops" }
            : { todos: ["a"], addTodo: "oops" },
        );
      },
    );

    it("keeps a store's function while waiting for ready and once it resolves", async () => {
      const addTodo = () => {};
      const backend = createMemoryBackend({ addTodo: "oops" });
      const store = createTestStore({ todos: [] as string[], addTodo });
      let resolve = (): void => {};
      const ready = new Promise<void>((done) => (resolve = done));
      createSyncEngine(backend, store.adapter, { ready }).connect();
      expect(store.getState()).toEqual({ todos: [], addTodo });

      backend.receive({ todos: ["a"], addTodo: "again" });
      expect(store.getState()).toEqual({ todos: ["a"], addTodo });

      resolve();
      await ready;
      await Promise.resolve();
      expect(store.getState()).toEqual({ todos: ["a"], addTodo });
      expect(backend.read()).toEqual({ todos: ["a"], addTodo: "again" });
    });

    it("keeps a store's function out of the merge when a local change applies a scheduled remote change first", () => {
      const addTodo = () => {};
      const backend = createMemoryBackend();
      const store = createTestStore({ todos: [] as string[], addTodo });
      createSyncEngine(backend, store.adapter, {
        schedule: () => {},
      }).connect();
      backend.receive({ todos: ["a"], addTodo: "oops" });

      store.update((s) => ({ ...s, todos: ["local"] }));

      expect(store.getState()).toEqual({ todos: ["a", "local"], addTodo });
      expect(backend.read()).toEqual({
        todos: ["a", "local"],
        addTodo: "oops",
      });
    });

    it("merges no backend value the filter rejects into a key the store syncs", () => {
      const { backend } = checkedBackend();
      const store = createTestStore({
        todos: [] as string[],
        view: "list",
        layout: "grid",
      });
      createSyncEngine(backend, store.adapter, {
        filter: notLocal,
        schedule: () => {},
      }).connect();
      backend.receive({
        todos: ["a"],
        view: "local:grid",
        layout: "local:rows",
      });

      store.update((s) => ({ ...s, todos: [...s.todos, "b"], layout: "rows" }));

      const merged = { todos: ["a", "b"], view: "list", layout: "rows" };
      expect(store.getState()).toEqual(merged);
      // The store's value decides what this peer writes, as for every key it syncs.
      expect(backend.read()).toEqual(merged);
    });

    it("reads a key the store does not hold by the backend's value alone", () => {
      const backend = createMemoryBackend();
      const store = createTestStore<{ todos: string[]; view?: string }>({
        todos: [],
        view: undefined,
      });
      createSyncEngine(backend, store.adapter, { filter: notLocal }).connect();

      backend.receive({ todos: [], view: "local:list" });
      expect(store.getState()).toEqual({ todos: [], view: undefined });

      backend.receive({ todos: [], view: "grid" });
      expect(store.getState()).toEqual({ todos: [], view: "grid" });
    });

    it("keeps a store's synced value when the backend holds one the filter rejects", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ todos: [] as string[], view: "list" });
      createSyncEngine(backend, store.adapter, { filter: notLocal }).connect();

      backend.receive({ todos: ["a"], view: "local:grid" });
      expect(store.getState()).toEqual({ todos: ["a"], view: "list" });
      expect(backend.read()).toEqual({ todos: ["a"], view: "local:grid" });

      // The store's value decides what this peer writes, as for every key it syncs.
      store.update((s) => ({ ...s, todos: ["local"] }));
      expect(backend.read()).toEqual({ todos: ["local"], view: "list" });
    });

    it("keeps a store's synced value while waiting for ready when the backend's turns to one the filter rejects", () => {
      const backend = createMemoryBackend({ view: "grid" });
      const store = createTestStore({ todos: [] as string[], view: "list" });
      createSyncEngine(backend, store.adapter, {
        filter: notLocal,
        ready: new Promise(() => {}),
      }).connect();
      expect(store.getState()).toEqual({ todos: [], view: "grid" });

      backend.receive({ view: "local:grid" });

      expect(store.getState()).toEqual({ todos: [], view: "grid" });
    });
  });

  describe("keys and omit", () => {
    it("keeps the keys omit names local in both directions and on connect", () => {
      const backend = createMemoryBackend({
        todos: [todo("9")],
        searchTerm: "room",
      });
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter, {
        omit: ["searchTerm"],
      }).connect();

      expect(store.getState()).toEqual({
        ...threeTodos(),
        todos: [todo("9")],
      });
      expect(backend.read()).toEqual({
        todos: [todo("9")],
        searchTerm: "room",
        filterStatus: "all",
      });

      store.update((s) => setSearchTerm(s, "local"));
      expect(backend.read()).toEqual({
        todos: [todo("9")],
        searchTerm: "room",
        filterStatus: "all",
      });

      backend.receive({ todos: [], filterStatus: "done", searchTerm: "peer" });
      expect(store.getState()).toEqual({
        todos: [],
        filterStatus: "done",
        searchTerm: "local",
      });
    });

    it("syncs only the keys listed, leaving the backend's other keys alone", () => {
      const backend = createMemoryBackend({
        todos: [todo("9")],
        filterStatus: "completed",
        theme: "dark",
      });
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter, { keys: ["todos"] }).connect();

      expect(store.getState()).toEqual({
        ...threeTodos(),
        todos: [todo("9")],
      });

      store.update((s) => setSearchTerm(s, "local"));
      expect(backend.read()).toEqual({
        todos: [todo("9")],
        filterStatus: "completed",
        theme: "dark",
      });

      backend.receive({ todos: [], filterStatus: "active", theme: "light" });
      expect(store.getState()).toEqual({
        ...setSearchTerm(threeTodos(), "local"),
        todos: [],
      });
    });

    it("still drops functions by default, even under a key keys lists", () => {
      const backend = createMemoryBackend();
      const add = () => {};
      const store = createTestStore({ ...threeTodos(), add });
      const engine = createSyncEngine(backend, store.adapter, {
        keys: ["todos", "add"],
      });
      engine.connect();

      expect(backend.read()).toEqual({ todos: threeTodos().todos });
      expect(engine.getSyncedState()).toEqual({ todos: threeTodos().todos });
    });

    it("syncs only what both a custom filter and omit keep", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const filter = vi.fn((key: string) => key !== "filterStatus");
      createSyncEngine(backend, store.adapter, {
        filter,
        omit: ["searchTerm"],
      }).connect();

      expect(backend.read()).toEqual({ todos: threeTodos().todos });
      expect(filter.mock.calls.map(([key]) => key)).not.toContain("searchTerm");
    });

    it.each([
      ["omit", { omit: ["searchTerm"] }],
      ["keys", { keys: ["todos", "addTodo"] }],
    ] as [
      string,
      SyncEngineConfig<{
        todos: string[];
        searchTerm: string;
        addTodo: () => void;
      }>,
    ][])(
      "keeps a store's function when a remote value arrives under its key, with %s",
      (_, config) => {
        const addTodo = () => {};
        const backend = createMemoryBackend();
        const store = createTestStore({
          todos: [] as string[],
          searchTerm: "",
          addTodo,
        });
        createSyncEngine(backend, store.adapter, config).connect();

        backend.receive({ todos: ["a"], addTodo: "oops" });

        expect(store.getState()).toEqual({
          todos: ["a"],
          searchTerm: "",
          addTodo,
        });
      },
    );

    it("syncs the keys listed less those omitted when given both at runtime", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      // A type error, so only a JavaScript caller or a cast gives both.
      const config = { keys: ["todos", "searchTerm"], omit: ["searchTerm"] };
      createSyncEngine(
        backend,
        store.adapter,
        config as unknown as SyncEngineConfig<TodoState>,
      ).connect();

      expect(backend.read()).toEqual({ todos: threeTodos().todos });
    });
  });

  describe("room keys this peer does not sync", () => {
    /** A store that holds only `todos`, as a MobX class or a record of atoms does. */
    const fixedKeyStore = (todos: string[] = []) =>
      createTestStore<{ todos: string[] }>({ todos }, ({ todos }) => ({
        todos,
      }));

    it.each([
      ["no config", {}],
      ["keys", { keys: ["todos"] }],
    ] as [string, SyncEngineConfig<{ todos: string[] }>][])(
      "keeps a key a fixed-key store cannot hold, with %s",
      (_, config) => {
        const backend = createMemoryBackend({ todos: ["a"], tags: ["x"] });
        const store = fixedKeyStore();
        const onError = vi.fn();
        createSyncEngine(backend, store.adapter, {
          ...config,
          onError,
        }).connect();
        expect(backend.read()).toEqual({ todos: ["a"], tags: ["x"] });

        backend.receive({ todos: ["a", "b"], tags: ["x", "y"] });
        expect(backend.read()).toEqual({
          todos: ["a", "b"],
          tags: ["x", "y"],
        });

        store.update(({ todos }) => ({ todos: [...todos, "local"] }));
        expect(backend.read()).toEqual({
          todos: ["a", "b", "local"],
          tags: ["x", "y"],
        });
        expect(onError).not.toHaveBeenCalled();
      },
    );

    it("deletes a key the store removes, also one it took from the room", () => {
      const backend = createMemoryBackend({ todos: ["a"], tags: ["x"] });
      const store = createTestStore<{ todos: string[]; tags?: string[] }>({
        todos: [],
      });
      createSyncEngine(backend, store.adapter).connect();
      expect(store.getState()).toEqual({ todos: ["a"], tags: ["x"] });

      store.update(({ todos }) => ({ todos }));

      expect(backend.read()).toEqual({ todos: ["a"] });
    });

    it("deletes a key the store held and drops while a remote change is applied", () => {
      const backend = createMemoryBackend();
      const store = createTestStore<{ todos: string[]; legacy?: string }>(
        { todos: [], legacy: "kept" },
        ({ legacy, ...rest }) =>
          legacy === "retired" ? rest : { ...rest, legacy },
      );
      createSyncEngine(backend, store.adapter).connect();

      expect(backend.read()).toEqual({ todos: [], legacy: "kept" });

      backend.receive({ todos: ["a"], legacy: "retired" });

      expect(store.getState()).toEqual({ todos: ["a"] });
      expect(backend.read()).toEqual({ todos: ["a"] });
    });

    it("deletes a key whose value the filter stops keeping", () => {
      const backend = createMemoryBackend({ tags: ["x"] });
      const store = createTestStore<{ todos: string[]; view: unknown }>({
        todos: [],
        view: "list",
      });
      createSyncEngine(backend, store.adapter).connect();
      expect(backend.read()).toEqual({ todos: [], view: "list", tags: ["x"] });

      store.update((state) => ({ ...state, view: () => "list" }));

      expect(backend.read()).toEqual({ todos: [], tags: ["x"] });
    });

    it("keeps what the backend holds now when a write back follows a change it has not heard of", () => {
      const backend = createMemoryBackend({ todos: [], count: 0, tags: ["x"] });
      let changeBackend = true;
      const store = createTestStore<{ todos: string[]; count: number }>(
        { todos: [], count: 0 },
        ({ todos }) => {
          // Code the store notifies changes the document, which the engine hears of later.
          if (changeBackend && todos.length > 0) {
            changeBackend = false;
            backend.write({ ...backend.read(), tags: ["y"] });
          }
          return { todos, count: todos.length };
        },
      );
      createSyncEngine(backend, store.adapter).connect();

      backend.receive({ todos: ["a"], count: 0, tags: ["x"] });

      expect(backend.read()).toEqual({ todos: ["a"], count: 1, tags: ["y"] });
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

    it("keeps both a local change and the pending remote changes it follows", () => {
      // Also checks that the write's `previous` is what the backend holds.
      const { backend, previous } = checkedBackend();
      const store = createTestStore(threeTodos());
      const scheduler = manualScheduler();
      createSyncEngine(backend, store.adapter, {
        schedule: scheduler.schedule,
      }).connect();
      const write = vi.spyOn(backend, "write");

      const remote = addTodo(toggleTodo(threeTodos(), "1"), todo("4"));
      backend.receive(remote);
      store.update((s) => toggleTodo(s, "2"));

      const both = toggleTodo(remote, "2");
      expect(store.getState()).toEqual(both);
      expect(backend.read()).toEqual(both);
      expect(write).toHaveBeenCalledTimes(1);
      expect(previous.at(-1)).toEqual(remote);
      scheduler.run();
      expect(store.getState()).toEqual(both);
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

    describe("a local change merged into the pending apply", () => {
      /**
       * Connects a store holding `initial`, lets the backend receive `remote` of it, and makes
       * `local` of the store's state before the flush. Checks that the write passed what the
       * backend held as `previous`, that the backend and the store agree, and that the flush
       * changes nothing, then returns the store's state.
       */
      const concurrent = <S extends object>(
        initial: S,
        remote: (s: S) => S,
        local: (s: S) => S,
      ): S => {
        const { backend, previous } = checkedBackend(initial);
        const store = createTestStore(initial);
        const scheduler = manualScheduler();
        createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        }).connect();

        const received = remote(initial);
        backend.receive(received);
        store.update(local);

        expect(previous.at(-1)).toEqual(received);
        expect(backend.read()).toEqual(store.getState());
        const merged = store.getState();
        scheduler.run();
        expect(store.getState()).toBe(merged);
        return merged;
      };

      it("lands a local edit on the item it targeted after remote inserts and deletes", () => {
        const state = concurrent(
          threeTodos(),
          (s) => deleteTodo({ ...s, todos: [todo("0"), ...s.todos] }, "1"),
          (s) => renameTodo(toggleTodo(s, "3"), "2", "Local"),
        );

        expect(state.todos).toEqual([
          todo("0"),
          todo("2", "Local"),
          { ...todo("3"), completed: true },
        ]);
      });

      describe("an edit to an item the remote side moved and changed", () => {
        type Row = { id: string; cells: Record<string, number> };
        const row = (id: string, cells: Record<string, number> = {}): Row => ({
          id,
          cells,
        });
        /** Sets cell `a` of row r1 to 2. */
        const editR1 = (s: { rows: Row[] }): { rows: Row[] } => ({
          rows: s.rows.map((r) =>
            r.id === "r1" ? { ...r, cells: { ...r.cells, a: 2 } } : r,
          ),
        });

        it("lands on that item after a remote insert", () => {
          const state = concurrent(
            { rows: [row("r1")] },
            () => ({ rows: [row("r0"), row("r1", { b: 1 })] }),
            editR1,
          );

          expect(state.rows).toEqual([row("r0"), row("r1", { b: 1, a: 2 })]);
        });

        it("lands on that item after a remote delete", () => {
          const state = concurrent(
            { rows: [row("r0"), row("r1")] },
            () => ({ rows: [row("r1", { b: 1 })] }),
            editR1,
          );

          expect(state.rows).toEqual([row("r1", { b: 1, a: 2 })]);
        });

        it("lands on an item the remote side only moved", () => {
          const state = concurrent(
            { rows: [row("r1")] },
            () => ({ rows: [row("r0"), row("r1")] }),
            editR1,
          );

          expect(state.rows).toEqual([row("r0"), row("r1", { a: 2 })]);
        });
      });

      it("keeps the items both sides inserted at one place, the remote ones first", () => {
        const state = concurrent(
          threeTodos(),
          (s) => addTodo(s, todo("remote")),
          (s) => addTodo(s, todo("local")),
        );

        expect(state.todos.map((t) => t.id)).toEqual([
          "1",
          "2",
          "3",
          "remote",
          "local",
        ]);
      });

      it("merges a record key by key, and keeps the local value where both changed it", () => {
        const state = concurrent(
          threeTodos(),
          (s): TodoState => ({
            ...renameTodo(setSearchTerm(s, "remote"), "1", "Remote"),
            filterStatus: "active",
          }),
          (s) =>
            toggleTodo(
              renameTodo(setSearchTerm(s, "local"), "1", "Local"),
              "1",
            ),
        );

        expect(state).toEqual({
          todos: [
            { ...todo("1", "Local"), completed: true },
            todo("2"),
            todo("3"),
          ],
          searchTerm: "local",
          filterStatus: "active",
        });
      });

      it("writes a local change that already holds the remote changes", () => {
        const state = concurrent(
          threeTodos(),
          (s) => toggleTodo(s, "1"),
          (s) => toggleTodo(toggleTodo(s, "1"), "2"),
        );

        expect(state).toEqual(toggleTodo(toggleTodo(threeTodos(), "1"), "2"));
      });

      it("replaces a string whole rather than merging its text", () => {
        const state = concurrent(
          setSearchTerm(threeTodos(), "draft"),
          (s) => setSearchTerm(s, "drafts"),
          (s) => setSearchTerm(s, "a draft"),
        );

        expect(state.searchTerm).toBe("a draft");
      });

      it("drops a local edit to an item the remote side deleted", () => {
        const state = concurrent(
          threeTodos(),
          (s) => deleteTodo(s, "2"),
          (s) => renameTodo(toggleTodo(s, "1"), "2", "Local"),
        );

        expect(state.todos).toEqual([
          { ...todo("1"), completed: true },
          todo("3"),
        ]);
      });

      it("keeps a local edit to a key the remote side deleted only when it replaced the value", () => {
        interface Settings {
          theme?: { color: string; size: number } | string;
          layout?: { columns: number };
          other: number;
        }
        const state = concurrent<Settings>(
          {
            theme: { color: "red", size: 1 },
            layout: { columns: 2 },
            other: 0,
          },
          ({ other }) => ({ other }),
          (s) => ({ ...s, theme: "dark", layout: { columns: 3 }, other: 1 }),
        );

        expect(state).toEqual({ theme: "dark", other: 1 });
      });

      it("keeps a local replacement of an item the remote side deleted", () => {
        const state = concurrent(
          { tags: ["a", "b", "c"] },
          (s) => ({ tags: s.tags.filter((tag) => tag !== "b") }),
          (s) => ({ tags: s.tags.map((tag) => (tag === "b" ? "B" : tag)) }),
        );

        expect(state.tags).toEqual(["a", "B", "c"]);
      });

      it("deletes what the store deleted, also where the remote side changed it", () => {
        const state = concurrent<{
          todos: string[];
          tags?: string[];
          note?: string;
        }>(
          { todos: ["a", "b"], tags: ["x"], note: "n" },
          (s) => ({ ...s, todos: [...s.todos, "c"], tags: ["x", "y"] }),
          ({ todos }) => ({ todos: todos.filter((item) => item !== "a") }),
        );

        expect(state).toEqual({ todos: ["b", "c"] });
      });

      it("keeps a key a fixed-key store cannot hold", () => {
        const backend = createMemoryBackend({ todos: ["a"], tags: ["x"] });
        const store = createTestStore<{ todos: string[] }>(
          { todos: [] },
          ({ todos }) => ({ todos }),
        );
        const scheduler = manualScheduler();
        createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        }).connect();

        backend.receive({ todos: ["a", "b"], tags: ["x", "y"] });
        store.update(({ todos }) => ({ todos: [...todos, "local"] }));

        expect(store.getState()).toEqual({ todos: ["a", "b", "local"] });
        expect(backend.read()).toEqual({
          todos: ["a", "b", "local"],
          tags: ["x", "y"],
        });
      });

      it("offers the store a remote value for a key it did not hold, as an apply does", () => {
        const backend = createMemoryBackend({ todos: [], legacy: "old" });
        // Holds `legacy` only once it is "ok".
        const store = createTestStore<{ todos: string[]; legacy?: string }>(
          { todos: [] },
          ({ legacy, ...rest }) =>
            legacy === "ok" ? { ...rest, legacy } : rest,
        );
        const scheduler = manualScheduler();
        createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        }).connect();
        expect(store.getState()).toEqual({ todos: [] });

        backend.receive({ todos: ["a"], legacy: "ok" });
        store.update(({ todos }) => ({ todos: [...todos, "b"] }));

        const merged = { todos: ["a", "b"], legacy: "ok" };
        expect(store.getState()).toEqual(merged);
        expect(backend.read()).toEqual(merged);
      });

      it("sends one remote event for the apply and the write of the local change", () => {
        const backend = createMemoryBackend();
        const store = createTestStore(threeTodos());
        const scheduler = manualScheduler();
        const engine = createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        });
        engine.connect();
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));

        backend.receive(toggleTodo(threeTodos(), "1"));
        store.update((s) => toggleTodo(s, "2"));
        scheduler.run();

        expect(events).toEqual(["remote"]);
      });

      it("lets the pending changes replace the local change after a write threw, without a base", () => {
        const backend = createMemoryBackend(threeTodos());
        const write = backend.write;
        let fail = true;
        backend.write = (next, previous) => {
          if (fail) {
            fail = false;
            throw new Error("offline");
          }
          write(next, previous);
        };
        const store = createTestStore(threeTodos());
        const scheduler = manualScheduler();
        const onError = vi.fn();
        createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
          onError,
        }).connect();
        store.update((s) => toggleTodo(s, "3"));
        expect(onError).toHaveBeenCalledTimes(1);

        const remote = deleteTodo(threeTodos(), "1");
        backend.receive(remote);
        store.update((s) => toggleTodo(s, "2"));

        expect(store.getState()).toEqual(remote);
        expect(backend.read()).toEqual(remote);
      });
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

  describe("store changes that change no synced key", () => {
    it("writes nothing for a change to a local key, and still sends local", () => {
      const backend = createMemoryBackend(threeTodos());
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter, {
        omit: ["searchTerm"],
      });
      engine.connect();
      const write = vi.spyOn(backend, "write");
      const events: SyncEvent[] = [];
      engine.subscribe((event) => events.push(event));

      store.update((s) => setSearchTerm(s, "x"));

      expect(write).not.toHaveBeenCalled();
      expect(events).toEqual(["local"]);
    });

    it("writes nothing for a local key changed after a remote change", () => {
      const backend = createMemoryBackend(threeTodos());
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter, {
        omit: ["searchTerm"],
      }).connect();
      backend.receive(toggleTodo(threeTodos(), "1"));
      const write = vi.spyOn(backend, "write");

      store.update((s) => setSearchTerm(s, "x"));

      expect(write).not.toHaveBeenCalled();
    });

    it("writes a synced change made right after a remote change", () => {
      const { backend } = checkedBackend(threeTodos());
      const store = createTestStore(threeTodos());
      createSyncEngine(backend, store.adapter).connect();
      backend.receive(toggleTodo(threeTodos(), "1"));
      const write = vi.spyOn(backend, "write");

      store.update((s) => toggleTodo(s, "2"));

      expect(write).toHaveBeenCalledTimes(1);
      expect(backend.read()).toEqual(
        toggleTodo(toggleTodo(threeTodos(), "1"), "2"),
      );
    });

    it("writes the store's value of a key whose backend value the filter rejects", () => {
      const notLocal = (_key: string, value: unknown) =>
        !(typeof value === "string" && value.startsWith("local:"));
      const backend = createMemoryBackend({ todos: ["a"], view: "list" });
      const store = createTestStore({
        todos: ["a"],
        view: "list",
        draft: "",
      });
      createSyncEngine(backend, store.adapter, {
        filter: notLocal,
        omit: ["draft"],
      }).connect();
      backend.receive({ todos: ["a"], view: "local:grid" });

      store.update((s) => ({ ...s, draft: "x" }));

      expect(backend.read()).toEqual({ todos: ["a"], view: "list" });
    });

    it("deletes a key the store took from the backend without a write, once the store removes it", () => {
      type State = { todos: string[]; extra?: number };
      const withoutExtra = (state: State): State => {
        const rest = { ...state };
        delete rest.extra;
        return rest;
      };
      let canHoldExtra = false;
      const backend = createMemoryBackend({ todos: ["a"], extra: 1 });
      // A store that cannot hold `extra` until it can, as a class that declares it later.
      const store = createTestStore<State>({ todos: ["a"] }, (next) =>
        canHoldExtra ? next : withoutExtra(next),
      );
      createSyncEngine(backend, store.adapter).connect();
      expect(store.getState()).toEqual({ todos: ["a"] });

      canHoldExtra = true;
      // The backend holds this value already.
      store.update((s) => ({ ...s, extra: 1 }));
      store.update(withoutExtra);

      expect(backend.read()).toEqual({ todos: ["a"] });
    });
  });

  describe("sync events", () => {
    /** Subscribes to `engine` and records each event with `isConnected()` as it arrives. */
    const record = (engine: SyncEngine) => {
      const events: [SyncEvent, boolean][] = [];
      const unsubscribe = engine.subscribe((event) =>
        events.push([event, engine.isConnected()]),
      );
      return {
        events: () => events.map(([event]) => event),
        seen: events,
        unsubscribe,
      };
    };

    it("sends local once a local change is written", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();
      const recorded = record(engine);
      let held: unknown;
      engine.subscribe(() => (held = backend.read()));

      store.update((s) => toggleTodo(s, "1"));

      expect(recorded.events()).toEqual(["local"]);
      expect(held).toEqual(toggleTodo(threeTodos(), "1"));
    });

    it("sends local for a store change to local keys only", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "searchTerm",
      });
      engine.connect();
      const recorded = record(engine);

      store.update((s) => setSearchTerm(s, "x"));

      expect(recorded.events()).toEqual(["local"]);
    });

    it("sends remote once the store holds the remote change and what it derived is written", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ todos: [] as string[], count: 0 });
      // An echo: a subscriber that derives `count` while the change is applied.
      store.adapter.subscribe(() => {
        const state = store.getState();
        if (state.count !== state.todos.length)
          store.setState({ ...state, count: state.todos.length });
      });
      const engine = createSyncEngine(backend, store.adapter);
      engine.connect();
      const recorded = record(engine);
      const seen: unknown[] = [];
      engine.subscribe(() => seen.push([store.getState(), backend.read()]));

      backend.receive({ todos: ["a", "b"], count: 0 });

      expect(recorded.events()).toEqual(["remote"]);
      const derived = { todos: ["a", "b"], count: 2 };
      expect(seen).toEqual([[derived, derived]]);
    });

    it("sends connect once connected, covering seeding and the adopted values", () => {
      const backend = createMemoryBackend({ todos: threeTodos().todos });
      const store = createTestStore(setSearchTerm(threeTodos(), "x"));
      const engine = createSyncEngine(backend, store.adapter);
      const recorded = record(engine);
      vi.spyOn(store.adapter, "setState");
      const write = vi.spyOn(backend, "write");

      engine.connect();
      engine.connect();

      expect(store.adapter.setState).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledTimes(1);
      expect(recorded.seen).toEqual([["connect", true]]);
    });

    it("sends connect for a connect that adopts the backend's values", () => {
      const backend = createMemoryBackend(toggleTodo(threeTodos(), "1"));
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      const recorded = record(engine);

      engine.connect();

      expect(store.getState()).toEqual(toggleTodo(threeTodos(), "1"));
      expect(recorded.seen).toEqual([["connect", true]]);
    });

    it("sends disconnect once disconnected, and nothing for a disconnect that changes nothing", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      const recorded = record(engine);

      engine.disconnect();
      engine.connect();
      engine.disconnect();
      engine.disconnect();

      expect(recorded.seen).toEqual([
        ["connect", true],
        ["disconnect", false],
      ]);
    });

    describe("with schedule", () => {
      const manualScheduler = () => {
        const queued: (() => void)[] = [];
        return {
          schedule: (flush: () => void) => {
            queued.push(flush);
          },
          run: () => queued.splice(0).forEach((flush) => flush()),
        };
      };

      it("sends one remote per flush", () => {
        const backend = createMemoryBackend();
        const store = createTestStore(threeTodos());
        const scheduler = manualScheduler();
        const engine = createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        });
        engine.connect();
        const recorded = record(engine);

        backend.receive(toggleTodo(threeTodos(), "1"));
        backend.receive(toggleTodo(toggleTodo(threeTodos(), "1"), "2"));
        expect(recorded.events()).toEqual([]);
        scheduler.run();
        expect(recorded.events()).toEqual(["remote"]);

        backend.receive(threeTodos());
        scheduler.run();
        expect(recorded.events()).toEqual(["remote", "remote"]);
      });

      it("sends remote, not local, for a local change that runs the pending apply", () => {
        const backend = createMemoryBackend();
        const store = createTestStore(threeTodos());
        const scheduler = manualScheduler();
        const engine = createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        });
        engine.connect();
        const recorded = record(engine);

        backend.receive(toggleTodo(threeTodos(), "1"));
        store.update((s) => toggleTodo(s, "2"));
        scheduler.run();

        expect(recorded.events()).toEqual(["remote"]);
      });

      it("sends the remote of a pending apply that disconnect runs before disconnect", () => {
        const backend = createMemoryBackend();
        const store = createTestStore(threeTodos());
        const scheduler = manualScheduler();
        const engine = createSyncEngine(backend, store.adapter, {
          schedule: scheduler.schedule,
        });
        engine.connect();
        const recorded = record(engine);

        backend.receive(toggleTodo(threeTodos(), "1"));
        engine.disconnect();
        scheduler.run();

        expect(recorded.seen).toEqual([
          ["remote", true],
          ["disconnect", false],
        ]);
      });
    });

    it("sends remote for a remote change the store ignores", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, {
        ...store.adapter,
        setState: () => {},
      });
      engine.connect();
      const recorded = record(engine);

      backend.receive(toggleTodo(threeTodos(), "1"));

      expect(store.getState()).toEqual(threeTodos());
      expect(recorded.events()).toEqual(["remote"]);
    });

    it("sends remote for a remote change to filtered-out keys only", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "searchTerm",
      });
      engine.connect();
      const recorded = record(engine);
      const setState = vi.spyOn(store.adapter, "setState");

      backend.receive(setSearchTerm(threeTodos(), "remote"));

      expect(setState).not.toHaveBeenCalled();
      expect(recorded.events()).toEqual(["remote"]);
    });

    it.each([
      ["without onError", undefined],
      ["with onError", () => {}],
    ])("sends nothing when write or setState throws, %s", (_, onError) => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      let failSetState = false;
      const engine = createSyncEngine(
        backend,
        {
          ...store.adapter,
          setState: (next) => {
            if (failSetState) throw new Error("invalid");
            store.setState(next);
          },
        },
        { onError },
      );
      engine.connect();
      const recorded = record(engine);
      vi.spyOn(backend, "write").mockImplementationOnce(() => {
        throw new Error("offline");
      });
      failSetState = true;

      const change = () => store.update((s) => toggleTodo(s, "1"));
      const receive = () => backend.receive(toggleTodo(threeTodos(), "2"));
      if (onError) {
        change();
        receive();
      } else {
        expect(change).toThrow("offline");
        expect(receive).toThrow("invalid");
      }

      expect(recorded.events()).toEqual([]);
    });

    it("sends nothing when connect() throws", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, {
        ...store.adapter,
        subscribe: () => {
          throw new Error("boom");
        },
      });
      const recorded = record(engine);

      expect(() => engine.connect()).toThrow("boom");
      engine.disconnect();

      expect(recorded.events()).toEqual([]);
    });

    it("sends disconnect when the pending apply disconnect() runs throws", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      let flush = (): void => {};
      const engine = createSyncEngine(
        backend,
        {
          ...store.adapter,
          setState: () => {
            throw new Error("invalid");
          },
        },
        { schedule: (next) => (flush = next) },
      );
      engine.connect();
      const recorded = record(engine);

      backend.receive(toggleTodo(threeTodos(), "1"));
      expect(() => engine.disconnect()).toThrow("invalid");
      flush();

      expect(recorded.seen).toEqual([["disconnect", false]]);
    });

    describe("a listener that throws", () => {
      let consoleError: MockInstance;
      beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      });
      afterEach(() => consoleError.mockRestore());

      it("is reported, and the other listeners and the store's subscribers still run", () => {
        const backend = createMemoryBackend();
        const store = createTestStore(threeTodos());
        const engine = createSyncEngine(backend, store.adapter);
        engine.connect();
        const failure = new Error("listener failed");
        engine.subscribe(() => {
          throw failure;
        });
        const recorded = record(engine);
        const subscriber = vi.fn();
        store.adapter.subscribe(subscriber);

        expect(() => store.update((s) => toggleTodo(s, "1"))).not.toThrow();
        expect(() =>
          backend.receive(toggleTodo(threeTodos(), "2")),
        ).not.toThrow();

        expect(recorded.events()).toEqual(["local", "remote"]);
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(consoleError).toHaveBeenCalledTimes(2);
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining("listener"),
          failure,
        );
      });
    });

    it("keeps sending across reconnects, and stops after unsubscribe", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      const recorded = record(engine);
      const other = record(engine);

      engine.connect();
      engine.disconnect();
      engine.connect();
      other.unsubscribe();
      store.update((s) => toggleTodo(s, "1"));
      recorded.unsubscribe();
      store.update((s) => toggleTodo(s, "2"));

      expect(recorded.events()).toEqual([
        "connect",
        "disconnect",
        "connect",
        "local",
      ]);
      expect(other.events()).toEqual(["connect", "disconnect", "connect"]);
    });

    it("skips a listener another one unsubscribes during the same event", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const engine = createSyncEngine(backend, store.adapter);
      const late = vi.fn();
      let unsubscribeLate = (): void => {};
      engine.subscribe(() => unsubscribeLate());
      unsubscribeLate = engine.subscribe(late);

      engine.connect();

      expect(late).not.toHaveBeenCalled();
    });
  });

  describe("getSyncedState", () => {
    it("returns the keys the filter keeps, with the store's values, while disconnected", () => {
      const backend = createMemoryBackend();
      const addTodoAction = () => {};
      const state = { ...setSearchTerm(threeTodos(), "x"), addTodoAction };
      const store = createTestStore(state);
      const engine = createSyncEngine(backend, store.adapter, {
        filter: (key, value) =>
          typeof value !== "function" && key !== "searchTerm",
      });

      const synced = engine.getSyncedState();

      expect(synced).toEqual({
        todos: threeTodos().todos,
        filterStatus: "all",
      });
      expect(synced.todos).toBe(state.todos);
      expect(synced).not.toBe(store.getState());
      expect(backend.read()).toEqual({});
    });

    it("leaves out __proto__ and keeps values that are not JSON", () => {
      const when = new Date(0);
      const state = JSON.parse(
        '{"__proto__":{"isAdmin":true},"count":1}',
      ) as Record<string, unknown>;
      state.when = when;
      const store = createTestStore(state);
      const engine = createSyncEngine(createMemoryBackend(), store.adapter);
      engine.connect();

      const synced = engine.getSyncedState();

      expect(Object.keys(synced)).toEqual(["count", "when"]);
      expect(synced.when).toBe(when);
    });
  });

  describe("ready", () => {
    /** A promise settled by hand. */
    const deferred = () => {
      let resolve!: () => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    /** Lets every promise reaction that is due run. */
    const settled = (): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve));

    it("seeds the keys the backend lacks only once ready resolves", async () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      const ready = deferred();

      createSyncEngine(backend, store.adapter, {
        ready: ready.promise,
      }).connect();
      await settled();
      expect(backend.read()).toEqual({});

      ready.resolve();
      await settled();
      expect(backend.read()).toEqual(threeTodos());
    });

    it("adopts what the backend holds on connect, and writes nothing", async () => {
      const backend = createMemoryBackend({ count: 7 });
      const write = vi.spyOn(backend, "write");
      const store = createTestStore({ count: 0, label: "mine" });

      createSyncEngine(backend, store.adapter, {
        ready: deferred().promise,
      }).connect();
      await settled();

      expect(store.getState()).toEqual({ count: 7, label: "mine" });
      expect(write).not.toHaveBeenCalled();
    });

    it("applies remote changes while waiting and keeps the keys only the store holds", async () => {
      const backend = createMemoryBackend();
      const write = vi.spyOn(backend, "write");
      const store = createTestStore({ count: 0, label: "mine" });
      const ready = deferred();
      createSyncEngine(backend, store.adapter, {
        ready: ready.promise,
      }).connect();

      backend.receive({ count: 7 });

      expect(store.getState()).toEqual({ count: 7, label: "mine" });
      expect(write).not.toHaveBeenCalled();

      ready.resolve();
      await settled();
      expect(backend.read()).toEqual({ count: 7, label: "mine" });
      expect(store.getState()).toEqual({ count: 7, label: "mine" });
    });

    it("removes a key the backend held and a peer deleted while waiting", async () => {
      const backend = createMemoryBackend({ count: 7, stale: true });
      const store = createTestStore<Record<string, unknown>>({ count: 0 });
      const ready = deferred();
      createSyncEngine(backend, store.adapter, {
        ready: ready.promise,
      }).connect();
      expect(store.getState()).toEqual({ count: 7, stale: true });

      backend.receive({ count: 7 });
      expect(store.getState()).toEqual({ count: 7 });

      ready.resolve();
      await settled();
      expect(backend.read()).toEqual({ count: 7 });
    });

    it("leaves what the store changes during a remote change for reconciliation", async () => {
      const backend = createMemoryBackend();
      const write = vi.spyOn(backend, "write");
      const store = createTestStore({ count: 0, doubled: 0 }, (state) => ({
        ...state,
        doubled: state.count * 2,
      }));
      const ready = deferred();
      createSyncEngine(backend, store.adapter, {
        ready: ready.promise,
      }).connect();

      backend.receive({ count: 7 });
      expect(store.getState()).toEqual({ count: 7, doubled: 14 });
      expect(write).not.toHaveBeenCalled();

      ready.resolve();
      await settled();
      expect(backend.read()).toEqual({ count: 7, doubled: 14 });
    });

    describe("local changes while waiting", () => {
      it("writes nothing and sends no local event until ready resolves", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();

        store.setState({ count: 1 });

        expect(write).not.toHaveBeenCalled();
        expect(events).toEqual(["connect"]);
        ready.resolve();
        await settled();
        expect(backend.read()).toEqual({ count: 1 });
      });

      it("drops a change to a key the backend holds", async () => {
        const backend = createMemoryBackend({ held: "room" });
        const store = createTestStore({ held: "mine", lacked: "mine" });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        }).connect();

        store.update((state) => ({ ...state, held: "edit", lacked: "edit" }));
        ready.resolve();
        await settled();

        expect(store.getState()).toEqual({ held: "room", lacked: "edit" });
        expect(backend.read()).toEqual({ held: "room", lacked: "edit" });
      });

      it("drops a change to a key that arrives after the change", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ held: "mine" });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        }).connect();

        store.setState({ held: "edit" });
        backend.receive({ held: "room" });
        ready.resolve();
        await settled();

        expect(store.getState()).toEqual({ held: "room" });
        expect(backend.read()).toEqual({ held: "room" });
      });

      it("writes the keys the backend lacks with seed 'never' after a local change", async () => {
        const backend = createMemoryBackend({ held: "room" });
        const store = createTestStore({ held: "mine", lacked: "mine" });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          seed: "never",
        }).connect();

        store.update((state) => ({ ...state, lacked: "edit" }));
        ready.resolve();
        await settled();

        expect(backend.read()).toEqual({ held: "room", lacked: "edit" });
      });

      it("writes nothing with seed 'never' and no local change", async () => {
        const backend = createMemoryBackend({ held: "room" });
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ held: "mine", lacked: "mine" });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          seed: "never",
        }).connect();

        backend.receive({ held: "room 2" });
        ready.resolve();
        await settled();

        expect(write).not.toHaveBeenCalled();
        expect(store.getState()).toEqual({ held: "room 2", lacked: "mine" });
      });

      it("forgets a local change of an earlier wait", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0 });
        const engine = createSyncEngine(backend, store.adapter, {
          ready: Promise.resolve(),
          seed: "never",
        });

        engine.connect();
        store.setState({ count: 1 });
        engine.disconnect();
        engine.connect();
        await settled();

        expect(write).not.toHaveBeenCalled();
      });

      it("does not take an apply of a remote change for a local change", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0, label: "mine" });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          seed: "never",
        }).connect();

        backend.receive({ count: 7 });
        ready.resolve();
        await settled();

        expect(write).not.toHaveBeenCalled();
      });

      it("writes local changes as usual once ready has resolved", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        }).connect();
        ready.resolve();
        await settled();

        store.setState({ count: 5 });

        expect(backend.read()).toEqual({ count: 5 });
      });
    });

    describe("lifecycle", () => {
      it("does nothing when ready settles after a disconnect", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));

        engine.connect();
        engine.disconnect();
        ready.resolve();
        await settled();

        expect(write).not.toHaveBeenCalled();
        expect(engine.isConnected()).toBe(false);
        expect(events).toEqual(["connect", "disconnect"]);
      });

      it("connects once when connect is called twice while waiting", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const create = vi.fn(() => ready.promise);
        const engine = createSyncEngine(backend, store.adapter, {
          ready: create,
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));

        engine.connect();
        engine.connect();
        ready.resolve();
        await settled();

        expect(create).toHaveBeenCalledOnce();
        expect(write).toHaveBeenCalledOnce();
        expect(events).toEqual(["connect", "ready"]);
      });

      it("reconciles once when reconnected while waiting on the same promise", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));

        engine.connect();
        engine.disconnect();
        engine.connect();
        ready.resolve();
        await settled();

        expect(write).toHaveBeenCalledOnce();
        expect(events).toEqual(["connect", "disconnect", "connect", "ready"]);
      });

      it("ignores the promise of an earlier connect", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const first = deferred();
        const second = deferred();
        const ready = vi
          .fn<() => Promise<void>>()
          .mockReturnValueOnce(first.promise)
          .mockReturnValueOnce(second.promise);
        const engine = createSyncEngine(backend, store.adapter, { ready });

        engine.connect();
        engine.disconnect();
        engine.connect();
        first.resolve();
        await settled();
        expect(backend.read()).toEqual({});

        second.resolve();
        await settled();
        expect(backend.read()).toEqual({ count: 0 });
      });

      it("leaves the pending flush of a later wait alone when an earlier promise settles", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const first = deferred();
        const flushes: (() => void)[] = [];
        const ready = vi
          .fn<() => Promise<void>>()
          .mockReturnValueOnce(first.promise)
          .mockReturnValueOnce(deferred().promise);
        const engine = createSyncEngine(backend, store.adapter, {
          ready,
          schedule: (flush) => flushes.push(flush),
        });
        engine.connect();
        engine.disconnect();
        engine.connect();
        backend.receive({ count: 7 });

        first.resolve();
        await settled();
        expect(store.getState()).toEqual({ count: 0 });

        flushes[0]();
        expect(store.getState()).toEqual({ count: 7 });
      });

      it("calls a ready function on every connect, and reconciles after it settles", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore<Record<string, unknown>>({ count: 0 });
        const next = deferred();
        const ready = vi
          .fn<() => Promise<void>>()
          .mockResolvedValueOnce(undefined)
          .mockReturnValueOnce(next.promise);
        const engine = createSyncEngine(backend, store.adapter, { ready });
        engine.connect();
        await settled();
        engine.disconnect();

        store.setState({ count: 0, gained: true });
        engine.connect();
        await settled();
        expect(backend.read()).toEqual({ count: 0 });

        next.resolve();
        await settled();
        expect(ready).toHaveBeenCalledTimes(2);
        expect(backend.read()).toEqual({ count: 0, gained: true });
      });

      it("waits a microtask on reconnect with a promise already settled", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore<Record<string, unknown>>({ count: 0 });
        const engine = createSyncEngine(backend, store.adapter, {
          ready: Promise.resolve(),
        });
        engine.connect();
        await settled();
        engine.disconnect();

        store.setState({ count: 1 });
        engine.connect();

        expect(store.getState()).toEqual({ count: 0 });
        expect(engine.isReady()).toBe(false);
        await settled();
        expect(engine.isReady()).toBe(true);
      });

      it("does not run ready until connect", () => {
        const ready = vi.fn(() => Promise.resolve());

        createSyncEngine(
          createMemoryBackend(),
          createTestStore({ count: 0 }).adapter,
          { ready },
        );

        expect(ready).not.toHaveBeenCalled();
      });

      it("never settling keeps the engine waiting, writing nothing, until a disconnect", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0, label: "mine" });
        const engine = createSyncEngine(backend, store.adapter, {
          ready: new Promise(() => {}),
        });
        engine.connect();

        store.update((state) => ({ ...state, label: "edit" }));
        backend.receive({ count: 7 });
        await settled();

        expect(store.getState()).toEqual({ count: 7, label: "edit" });
        expect(write).not.toHaveBeenCalled();
        expect(engine.isReady()).toBe(false);
        engine.disconnect();
        expect(engine.isConnected()).toBe(false);
      });
    });

    describe("status", () => {
      it("reports connected and not ready while waiting, then ready", async () => {
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const engine = createSyncEngine(createMemoryBackend(), store.adapter, {
          ready: ready.promise,
        });
        expect(engine.isReady()).toBe(false);

        engine.connect();
        expect(engine.isConnected()).toBe(true);
        expect(engine.isReady()).toBe(false);

        ready.resolve();
        await settled();
        expect(engine.isReady()).toBe(true);

        engine.disconnect();
        expect(engine.isReady()).toBe(false);
      });

      it("reports ready as soon as it connects without the option, and sends no ready event", () => {
        const store = createTestStore({ count: 0 });
        const engine = createSyncEngine(createMemoryBackend(), store.adapter);
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        expect(engine.isReady()).toBe(false);

        engine.connect();
        expect(engine.isReady()).toBe(true);
        expect(events).toEqual(["connect"]);

        engine.disconnect();
        expect(engine.isReady()).toBe(false);
      });

      it("stays not ready for a store subscriber until reconciliation is done", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        });
        engine.connect();
        const seen: boolean[] = [];
        store.adapter.subscribe(() => seen.push(engine.isReady()));

        // A write of its own tells no subscriber, so reconciling is what brings it to the store.
        backend.write({ count: 2 });
        ready.resolve();
        await settled();

        expect(store.getState()).toEqual({ count: 2 });
        expect(seen).toEqual([false]);
        expect(engine.isReady()).toBe(true);
      });

      it("never reports ready when reconciliation fails after changing the store", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0, doubled: 0 }, (state) => ({
          ...state,
          doubled: state.count * 2,
        }));
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          seed: "never",
          onError: () => {},
        });
        engine.connect();
        const seen: boolean[] = [];
        engine.subscribe(() => seen.push(engine.isReady()));
        store.adapter.subscribe(() => seen.push(engine.isReady()));

        backend.write({ count: 2 });
        vi.spyOn(backend, "write").mockImplementation(() => {
          throw new Error("write failed");
        });
        ready.resolve();
        await settled();

        expect(engine.isConnected()).toBe(false);
        expect(seen).not.toContain(true);
      });

      it("is neither ready nor reports it after a store subscriber disconnects while reconciling", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        });
        const events: string[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();
        store.adapter.subscribe(() => engine.disconnect());

        backend.write({ count: 2 });
        ready.resolve();
        await settled();

        expect(engine.isConnected()).toBe(false);
        expect(engine.isReady()).toBe(false);
        expect(events).toEqual(["connect", "disconnect"]);
      });

      it("keeps waiting after a store subscriber reconnects while reconciling", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const first = deferred();
        const second = deferred();
        const waits = [first.promise, second.promise];
        const engine = createSyncEngine(backend, store.adapter, {
          ready: () => waits.shift() as Promise<void>,
        });
        const events: string[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();
        let reconnected = false;
        store.adapter.subscribe(() => {
          if (reconnected) return;
          reconnected = true;
          engine.disconnect();
          engine.connect();
        });

        backend.write({ count: 2 });
        first.resolve();
        await settled();

        expect(engine.isReady()).toBe(false);
        expect(events).toEqual(["connect", "disconnect", "connect"]);

        second.resolve();
        await settled();

        expect(engine.isReady()).toBe(true);
        expect(events).toEqual(["connect", "disconnect", "connect", "ready"]);
      });

      it("writes back what the store changes while reconciling at settling", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0, doubled: 0 }, (state) => ({
          ...state,
          doubled: state.count * 2,
        }));
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          seed: "never",
        }).connect();

        backend.write({ count: 2 });
        ready.resolve();
        await settled();

        expect(backend.read()).toEqual({ count: 2, doubled: 4 });
      });

      it("sends connect, each remote change, then ready once reconciled", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0, label: "mine" });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        });
        const seen: [SyncEvent, boolean, unknown][] = [];
        engine.subscribe((event) =>
          seen.push([event, engine.isReady(), backend.read()]),
        );

        engine.connect();
        backend.receive({ count: 7 });
        ready.resolve();
        await settled();

        expect(seen).toEqual([
          ["connect", false, {}],
          ["remote", false, { count: 7 }],
          ["ready", true, { count: 7, label: "mine" }],
        ]);
      });
    });

    describe("rejected", () => {
      it("disconnects and reports to onError without writing", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const failure = new Error("no room");
        const seen: unknown[] = [];
        const engine: SyncEngine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          onError: (error, source) =>
            seen.push([error, source, engine.isConnected()]),
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();

        ready.reject(failure);
        await settled();

        expect(seen).toEqual([[failure, "ready", false]]);
        expect(write).not.toHaveBeenCalled();
        expect(events).toEqual(["connect", "disconnect"]);
        expect(engine.isReady()).toBe(false);
      });

      it("stops hearing both sides and keeps what the store adopted", async () => {
        const backend = createMemoryBackend({ count: 7 });
        const store = createTestStore({ count: 0, label: "mine" });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          onError: () => {},
        });
        engine.connect();

        ready.reject(new Error("no room"));
        await settled();
        backend.receive({ count: 8 });
        store.update((state) => ({ ...state, label: "edit" }));

        expect(store.getState()).toEqual({ count: 7, label: "edit" });
        expect(backend.read()).toEqual({ count: 8 });
      });

      it("connects again with a ready function that resolves", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const ready = vi
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error("no room"))
          .mockResolvedValueOnce(undefined);
        const onError = vi.fn();
        const engine = createSyncEngine(backend, store.adapter, {
          ready,
          onError,
        });

        engine.connect();
        await settled();
        engine.connect();
        await settled();

        expect(onError).toHaveBeenCalledOnce();
        expect(engine.isReady()).toBe(true);
        expect(backend.read()).toEqual({ count: 0 });
      });

      it("drops a flush handed out before it rejects", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const flushes: (() => void)[] = [];
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          onError: () => {},
          schedule: (flush) => flushes.push(flush),
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();
        backend.receive({ count: 7 });

        ready.reject(new Error("no room"));
        await settled();
        flushes[0]();

        expect(store.getState()).toEqual({ count: 0 });
        expect(events).toEqual(["connect", "disconnect"]);
      });

      it("hands out a new flush after a failed wait, and the old one does nothing", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const flushes: (() => void)[] = [];
        const ready = vi
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error("no room"))
          .mockReturnValueOnce(deferred().promise);
        const engine = createSyncEngine(backend, store.adapter, {
          ready,
          onError: () => {},
          schedule: (flush) => flushes.push(flush),
        });
        engine.connect();
        backend.receive({ count: 7 });
        await settled();
        engine.connect();

        backend.receive({ count: 8 });
        expect(flushes).toHaveLength(2);
        flushes[0]();
        expect(store.getState()).toEqual({ count: 7 });
        flushes[1]();
        expect(store.getState()).toEqual({ count: 8 });
      });

      it("forgets the pending apply of a failed wait on the next connect", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const ready = vi
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error("no room"))
          .mockResolvedValueOnce(undefined);
        const engine = createSyncEngine(backend, store.adapter, {
          ready,
          onError: () => {},
          schedule: () => {},
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();
        backend.receive({ count: 7 });
        await settled();

        engine.connect();
        await settled();

        expect(events).toEqual(["connect", "disconnect", "connect", "ready"]);
      });

      it("ignores a rejection after a disconnect", async () => {
        const store = createTestStore({ count: 0 });
        const ready = deferred();
        const onError = vi.fn();
        const engine = createSyncEngine(createMemoryBackend(), store.adapter, {
          ready: ready.promise,
          onError,
        });
        engine.connect();
        engine.disconnect();

        ready.reject(new Error("no room"));
        await settled();

        expect(onError).not.toHaveBeenCalled();
      });

      describe("unhandled rejections", () => {
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown): void => {
          unhandled.push(reason);
        };

        beforeEach(() => {
          unhandled.length = 0;
          process.on("unhandledRejection", onUnhandled);
        });

        afterEach(() => {
          process.off("unhandledRejection", onUnhandled);
        });

        it("surfaces a rejection without onError as an unhandled rejection", async () => {
          const store = createTestStore({ count: 0 });
          const ready = deferred();
          const failure = new Error("no room");
          const engine = createSyncEngine(
            createMemoryBackend(),
            store.adapter,
            { ready: ready.promise },
          );
          engine.connect();

          ready.reject(failure);
          await settled();

          expect(unhandled).toEqual([failure]);
          expect(engine.isConnected()).toBe(false);
        });

        it("does not leave a promise rejected before connect unhandled", async () => {
          const store = createTestStore({ count: 0 });
          const failure = new Error("no room");
          const onError = vi.fn();
          const engine = createSyncEngine(
            createMemoryBackend(),
            store.adapter,
            { ready: Promise.reject(failure), onError },
          );
          await settled();
          expect(unhandled).toEqual([]);

          engine.connect();
          await settled();

          expect(onError).toHaveBeenCalledWith(failure, "ready");
          expect(unhandled).toEqual([]);
        });

        it("surfaces what fails while reconciling without onError", async () => {
          const backend = createMemoryBackend();
          const failure = new Error("write failed");
          vi.spyOn(backend, "write").mockImplementation(() => {
            throw failure;
          });
          const ready = deferred();
          const engine = createSyncEngine(
            backend,
            createTestStore({ count: 0 }).adapter,
            { ready: ready.promise },
          );
          engine.connect();

          ready.resolve();
          await settled();

          expect(unhandled).toEqual([failure]);
          expect(engine.isConnected()).toBe(false);
        });

        it("drops the rejection of a wait a failed connect abandoned", async () => {
          for (const onError of [vi.fn(), undefined]) {
            const backend = createMemoryBackend();
            vi.spyOn(backend, "read").mockReturnValue(
              "nonsense" as unknown as JsonObject,
            );
            const ready = deferred();
            const engine = createSyncEngine(
              backend,
              createTestStore({ count: 0 }).adapter,
              { ready: () => ready.promise, onError },
            );

            expect(() => engine.connect()).toThrow(TypeError);
            ready.reject(new Error("late"));
            await settled();

            expect(unhandled).toEqual([]);
            if (onError) expect(onError).not.toHaveBeenCalled();
          }
        });

        it("does nothing when a wait a failed connect abandoned resolves", async () => {
          const backend = createMemoryBackend();
          const write = vi.spyOn(backend, "write");
          const store = createTestStore({ count: 0 });
          const ready = deferred();
          const engine = createSyncEngine(
            backend,
            {
              ...store.adapter,
              subscribe: () => {
                throw new Error("subscribe failed");
              },
            },
            { ready: ready.promise },
          );

          expect(() => engine.connect()).toThrow("subscribe failed");
          ready.resolve();
          await settled();

          expect(write).not.toHaveBeenCalled();
          expect(engine.isReady()).toBe(false);
        });

        it("does not blame a filter that throws on an earlier failed connect", async () => {
          const failure = new Error("filter failed");
          const store = createTestStore({ count: 0 });
          let badStore = true;
          let badFilter = false;
          const ready = deferred();
          const onError = vi.fn();
          const engine = createSyncEngine(
            createMemoryBackend(),
            {
              ...store.adapter,
              getState: () =>
                badStore
                  ? (1 as unknown as { count: number })
                  : store.getState(),
            },
            {
              ready: ready.promise,
              onError,
              filter: () => {
                if (badFilter) throw failure;
                return true;
              },
            },
          );
          expect(() => engine.connect()).toThrow(TypeError);

          badStore = false;
          engine.connect();
          badFilter = true;
          ready.resolve();
          await settled();

          expect(onError).not.toHaveBeenCalled();
          expect(unhandled).toEqual([failure]);
        });

        it("lets a filter that throws while reconciling propagate past onError", async () => {
          const failure = new Error("filter failed");
          let failing = false;
          const ready = deferred();
          const onError = vi.fn();
          const engine = createSyncEngine(
            createMemoryBackend(),
            createTestStore({ count: 0 }).adapter,
            {
              ready: ready.promise,
              onError,
              filter: () => {
                if (failing) throw failure;
                return true;
              },
            },
          );
          engine.connect();

          failing = true;
          ready.resolve();
          await settled();

          expect(onError).not.toHaveBeenCalled();
          expect(unhandled).toEqual([failure]);
          expect(engine.isConnected()).toBe(false);
        });
      });
    });

    describe("failures", () => {
      it("reports a read that fails while reconciling and disconnects", async () => {
        const backend = createMemoryBackend();
        const ready = deferred();
        const onError = vi.fn();
        const engine = createSyncEngine(
          backend,
          createTestStore({ count: 0 }).adapter,
          { ready: ready.promise, onError },
        );
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();

        vi.spyOn(backend, "read").mockReturnValue(
          "nonsense" as unknown as JsonObject,
        );
        ready.resolve();
        await settled();

        expect(onError).toHaveBeenCalledWith(expect.any(TypeError), "backend");
        expect(engine.isConnected()).toBe(false);
        expect(events).toEqual(["connect", "disconnect"]);
      });

      it("reports a seed write that fails and disconnects", async () => {
        const backend = createMemoryBackend();
        const failure = new Error("write failed");
        vi.spyOn(backend, "write").mockImplementation(() => {
          throw failure;
        });
        const ready = deferred();
        const onError = vi.fn();
        const engine = createSyncEngine(
          backend,
          createTestStore({ count: 0 }).adapter,
          { ready: ready.promise, onError },
        );
        engine.connect();

        ready.resolve();
        await settled();

        expect(onError).toHaveBeenCalledWith(failure, "backend");
        expect(engine.isConnected()).toBe(false);
      });

      it("reports a setState that fails while reconciling and disconnects", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const failure = new Error("setState failed");
        const ready = deferred();
        const onError = vi.fn();
        const flushes: (() => void)[] = [];
        const engine = createSyncEngine(
          backend,
          {
            ...store.adapter,
            setState: () => {
              throw failure;
            },
          },
          {
            ready: ready.promise,
            onError,
            schedule: (flush) => flushes.push(flush),
          },
        );
        engine.connect();
        backend.receive({ count: 7 });

        ready.resolve();
        await settled();

        expect(onError).toHaveBeenCalledWith(failure, "store");
        expect(engine.isConnected()).toBe(false);
      });

      it("reconnects after a failure", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const write = vi.spyOn(backend, "write");
        write.mockImplementationOnce(() => {
          throw new Error("write failed");
        });
        const engine = createSyncEngine(backend, store.adapter, {
          ready: Promise.resolve(),
          onError: () => {},
        });

        engine.connect();
        await settled();
        engine.connect();
        await settled();

        expect(engine.isReady()).toBe(true);
        expect(backend.read()).toEqual({ count: 0 });
      });

      it("throws from connect for a bad read or getState, and subscribes to nothing", () => {
        const backend = createMemoryBackend();
        vi.spyOn(backend, "read").mockReturnValue(
          "nonsense" as unknown as JsonObject,
        );
        const engine = createSyncEngine(
          backend,
          createTestStore({ count: 0 }).adapter,
          { ready: deferred().promise },
        );
        expect(() => engine.connect()).toThrow(TypeError);
        expect(engine.isConnected()).toBe(false);

        const good = createMemoryBackend();
        const subscribe = vi.spyOn(good, "subscribe");
        const badStore = createSyncEngine(
          good,
          {
            ...createTestStore({ count: 0 }).adapter,
            getState: () => 1 as unknown as { count: number },
          },
          { ready: deferred().promise },
        );
        expect(() => badStore.connect()).toThrow(TypeError);
        expect(badStore.isConnected()).toBe(false);
        expect(subscribe).not.toHaveBeenCalled();
      });

      it("throws from connect, touching nothing, when a ready function throws", () => {
        const backend = createMemoryBackend();
        const read = vi.spyOn(backend, "read");
        const failure = new Error("no provider");
        const engine = createSyncEngine(
          backend,
          createTestStore({ count: 0 }).adapter,
          {
            ready: () => {
              throw failure;
            },
          },
        );

        expect(() => engine.connect()).toThrow(failure);
        expect(read).not.toHaveBeenCalled();
        expect(engine.isConnected()).toBe(false);
      });

      it("reports a remote change that fails while waiting, and stays waiting", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const failure = new Error("setState failed");
        let failing = true;
        const onError = vi.fn();
        const ready = deferred();
        const engine = createSyncEngine(
          backend,
          {
            ...store.adapter,
            setState: (state) => {
              if (failing) throw failure;
              store.setState(state);
            },
          },
          { ready: ready.promise, onError },
        );
        engine.connect();

        backend.receive({ count: 7 });
        expect(onError).toHaveBeenCalledWith(failure, "store");
        expect(engine.isConnected()).toBe(true);

        failing = false;
        ready.resolve();
        await settled();
        expect(store.getState()).toEqual({ count: 7 });
        expect(engine.isReady()).toBe(true);
      });
    });

    describe("with the other options", () => {
      it("keeps local keys out of what it adopts and writes", async () => {
        for (const options of [
          { omit: ["draft"] },
          { keys: ["count", "label"] },
          { filter: (key: string) => key !== "draft" },
        ] as SyncEngineConfig<{
          count: number;
          label: string;
          draft: string;
        }>[]) {
          const backend = createMemoryBackend({ count: 7, draft: "room" });
          const store = createTestStore({
            count: 0,
            label: "mine",
            draft: "local",
          });
          const ready = deferred();
          const engine = createSyncEngine(backend, store.adapter, {
            ...options,
            ready: ready.promise,
          });
          engine.connect();

          store.update((state) => ({ ...state, draft: "edit" }));
          backend.receive({ count: 8, draft: "room" });
          expect(engine.getSyncedState()).toEqual({ count: 8, label: "mine" });
          ready.resolve();
          await settled();

          expect(store.getState()).toEqual({
            count: 8,
            label: "mine",
            draft: "edit",
          });
          expect(backend.read()).toEqual({
            count: 8,
            label: "mine",
            draft: "room",
          });
        }
      });

      it("applies a flush per key while waiting, and writes nothing", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0, label: "mine" });
        const flushes: (() => void)[] = [];
        createSyncEngine(backend, store.adapter, {
          ready: deferred().promise,
          schedule: (flush) => flushes.push(flush),
        }).connect();

        backend.receive({ count: 7 });
        expect(store.getState().count).toBe(0);
        flushes[0]();

        expect(store.getState()).toEqual({ count: 7, label: "mine" });
        expect(write).not.toHaveBeenCalled();
      });

      it("applies a pending flush before reconciling, and the late flush does nothing", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0, label: "mine" });
        const setState = vi.spyOn(store.adapter, "setState");
        const flushes: (() => void)[] = [];
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          schedule: (flush) => flushes.push(flush),
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();
        backend.receive({ count: 7 });

        ready.resolve();
        await settled();
        flushes[0]();

        expect(setState).toHaveBeenCalledOnce();
        expect(store.getState()).toEqual({ count: 7, label: "mine" });
        expect(events).toEqual(["connect", "remote", "ready"]);
      });

      it("removes a key a peer deleted in a flush pending when ready resolves", async () => {
        const backend = createMemoryBackend({ a: 1, b: 2 });
        const store = createTestStore<Record<string, unknown>>({ a: 0 });
        const flushes: (() => void)[] = [];
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          schedule: (flush) => flushes.push(flush),
        }).connect();
        expect(store.getState()).toEqual({ a: 1, b: 2 });

        backend.receive({ a: 1 });
        ready.resolve();
        await settled();
        flushes[0]();

        expect(store.getState()).toEqual({ a: 1 });
        expect(backend.read()).toEqual({ a: 1 });
      });

      it("takes the failure path when a flush pending at settling cannot read", async () => {
        const backend = createMemoryBackend({ a: 1 });
        const store = createTestStore({ a: 0, label: "mine" });
        const ready = deferred();
        const onError = vi.fn();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          onError,
          schedule: () => {},
        });
        const events: SyncEvent[] = [];
        engine.subscribe((event) => events.push(event));
        engine.connect();
        backend.receive({ a: 2 });

        vi.spyOn(backend, "read").mockReturnValue(
          "nonsense" as unknown as JsonObject,
        );
        ready.resolve();
        await settled();

        expect(onError).toHaveBeenCalledWith(expect.any(TypeError), "backend");
        expect(engine.isConnected()).toBe(false);
        expect(events).toEqual(["connect", "disconnect"]);
      });

      it("stops when applying a pending flush at settling disconnects the engine", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0, label: "mine" });
        const ready = deferred();
        const engine = createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          schedule: () => {},
        });
        engine.subscribe((event) => {
          if (event === "remote") engine.disconnect();
        });
        engine.connect();
        backend.receive({ count: 7 });

        ready.resolve();
        await settled();

        expect(write).not.toHaveBeenCalled();
        expect(engine.isConnected()).toBe(false);
      });

      it("schedules the next remote change after one covered by reconciliation", async () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const flushes: (() => void)[] = [];
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
          schedule: (flush) => flushes.push(flush),
        }).connect();
        backend.receive({ count: 7 });
        ready.resolve();
        await settled();

        backend.receive({ count: 8 });
        flushes[1]();

        expect(store.getState()).toEqual({ count: 8 });
      });

      it("runs a pending apply per key on disconnect, and writes nothing", () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        const store = createTestStore({ count: 0, label: "mine" });
        const engine = createSyncEngine(backend, store.adapter, {
          ready: deferred().promise,
          schedule: () => {},
        });
        engine.connect();
        backend.receive({ count: 7 });

        engine.disconnect();

        expect(store.getState()).toEqual({ count: 7, label: "mine" });
        expect(write).not.toHaveBeenCalled();
      });

      it("reports no write loop while waiting, and guards against one afterwards", async () => {
        const backend = createMemoryBackend();
        const write = vi.spyOn(backend, "write");
        let stamp = 0;
        const store = createTestStore({ count: 0, stamp: 0 });
        const onError = vi.fn();
        const ready = deferred();
        createSyncEngine(
          backend,
          {
            ...store.adapter,
            setState: (state) => store.setState({ ...state, stamp: ++stamp }),
          },
          { ready: ready.promise, onError },
        ).connect();

        backend.receive({ count: 1 });
        backend.receive({ count: 2 });
        backend.receive({ count: 3 });
        expect(write).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();

        ready.resolve();
        await settled();
        for (let i = 1; i <= 7; i++)
          backend.receive({ ...backend.read(), stamp: i * 100 });

        expect(onError).toHaveBeenCalledWith(
          expect.any(WriteLoopError),
          "store",
        );
      });

      it("keeps a remote change a synchronous relay delivers during the seed", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const write = backend.write;
        let relayed = false;
        backend.write = (next, previous) => {
          write(next, previous);
          if (relayed) return;
          relayed = true;
          backend.receive({ ...backend.read(), count: 7 });
        };
        const store = createTestStore({ count: 0, label: "mine" });
        const ready = deferred();
        createSyncEngine(backend, store.adapter, {
          ready: ready.promise,
        }).connect();

        ready.resolve();
        await settled();

        expect(store.getState()).toEqual({ count: 7, label: "mine" });
        expect(backend.read()).toEqual({ count: 7, label: "mine" });
      });

      it("takes any thenable", async () => {
        const backend = createMemoryBackend();
        const engine = createSyncEngine(
          backend,
          createTestStore({ count: 0 }).adapter,
          {
            ready: {
              then: (resolve) =>
                Promise.resolve().then(() => resolve?.(undefined)) as never,
            },
          },
        );

        engine.connect();
        await settled();

        expect(backend.read()).toEqual({ count: 0 });
      });
    });
  });
});
