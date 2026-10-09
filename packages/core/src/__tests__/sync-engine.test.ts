import { describe, expect, it, vi } from "vitest";
import { createSyncEngine } from "../index.js";
import { createMemoryBackend } from "../testing.js";
import {
  addTodo,
  createTestStore,
  deepFreeze,
  prototypeHijacks,
  prototypeMemberKeys,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  toggleTodo,
} from "./helpers.js";

/**
 * A memory backend that records the `previous` of every write and checks that it is what the
 * backend held, as JSON would store it, which is what `CrdtBackend.write` promises.
 */
const checkedBackend = (initial?: unknown) => {
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

    it("adopts a non-empty backend even with seed 'never'", () => {
      const backend = createMemoryBackend(threeTodos());
      const store = createTestStore({
        ...threeTodos(),
        todos: [todo("local")],
      });

      createSyncEngine(backend, store.adapter, { seed: "never" }).connect();

      expect(store.getState()).toEqual(threeTodos());
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

    it("keeps synced keys the backend lacks and seeds them", () => {
      const backend = createMemoryBackend({ todos: [todo("remote")] });
      const store = createTestStore(threeTodos());

      createSyncEngine(backend, store.adapter).connect();

      const expected = { ...threeTodos(), todos: [todo("remote")] };
      expect(store.getState()).toEqual(expected);
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

    it("writes the seed once, leaving the adopted keys untouched", () => {
      const backend = createMemoryBackend({ todos: [todo("remote")] });
      const store = createTestStore(threeTodos());
      const write = vi.spyOn(backend, "write");

      createSyncEngine(backend, store.adapter).connect();

      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith({
        ...threeTodos(),
        todos: [todo("remote")],
      });
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

    it("seeds an empty backend with what the store holds at connect time", () => {
      const backend = createMemoryBackend();
      const store = createTestStore(threeTodos());
      store.update((s) => toggleTodo(s, "1"));

      createSyncEngine(backend, store.adapter).connect();

      expect(backend.read()).toEqual(toggleTodo(threeTodos(), "1"));
      expect(backend.read()).toEqual(store.getState());
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
      expect(store.getState()).toEqual(addTodo(threeTodos(), todo("4")));

      store.update((s) => toggleTodo(s, "1"));

      expect(previous.at(-1)).toEqual(remote);
      expect(backend.read()).toEqual(
        toggleTodo(addTodo(threeTodos(), todo("4")), "1"),
      );
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

    it("ignores remote keys that the filter excludes, even when the store lacks them", () => {
      const backend = createMemoryBackend({
        ...threeTodos(),
        secret: "remote",
      });
      const store = createTestStore<object>(threeTodos());

      createSyncEngine(backend, store.adapter, {
        filter: (key) => key !== "secret",
      }).connect();

      expect(store.getState()).toEqual(threeTodos());
    });

    it("still deletes keys removed from the backend after connect", () => {
      const backend = createMemoryBackend();
      const store = createTestStore<Record<string, unknown>>({ a: 1, b: 2 });
      createSyncEngine(backend, store.adapter).connect();

      backend.receive({ a: 1 });

      expect(store.getState()).toEqual({ a: 1 });
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
