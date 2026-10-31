import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  atom,
  createStore,
  getDefaultStore,
  type WritableAtom,
} from "jotai/vanilla";
import { createMemoryBackend } from "@homeostate/core/testing";
import { atomWithSync } from "../index.js";

interface Counter {
  count: number;
  label: string;
}

/** What `mount` threw; Jotai wraps what `onMount` throws in an `AggregateError`. */
const errorsFrom = (mount: () => void): unknown[] => {
  try {
    mount();
  } catch (error) {
    return (error as { errors?: unknown[] }).errors ?? [error];
  }
  return [];
};

describe("atomWithSync", () => {
  describe("lifetime", () => {
    it("connects when the atom is first mounted", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();

      store.sub(syncedAtom, () => {});

      expect(backend.read()).toEqual({ count: 0, label: "a" });
    });

    it("reads and writes neither the store nor the backend until it is mounted", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend({ count: 9, label: "remote" });
      const read = vi.spyOn(backend, "read");
      const write = vi.spyOn(backend, "write");
      const subscribe = vi.spyOn(backend, "subscribe");
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();

      expect(store.get(syncedAtom)).toEqual({ count: 0, label: "a" });
      store.set(syncedAtom, { count: 1, label: "a" });

      expect(store.get(counterAtom)).toEqual({ count: 1, label: "a" });
      expect(read).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
    });

    it("gives its subscribers the state the backend holds on mount", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend({ count: 7, label: "z" });
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();
      const listener = vi.fn();

      store.sub(syncedAtom, listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.get(syncedAtom)).toEqual({ count: 7, label: "z" });
    });

    it("keeps syncing until the last subscriber unmounts", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();
      const unsubscribeFirst = store.sub(syncedAtom, () => {});
      const unsubscribeSecond = store.sub(syncedAtom, () => {});

      unsubscribeFirst();
      store.set(syncedAtom, { count: 1, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });

      unsubscribeSecond();
      store.set(syncedAtom, { count: 2, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });
    });

    it("stops applying remote changes on the last unmount", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();

      store.sub(syncedAtom, () => {})();
      backend.receive({ count: 5, label: "b" });

      expect(store.get(counterAtom)).toEqual({ count: 0, label: "a" });
    });
  });

  describe("reconnecting", () => {
    it("adopts the backend and syncs again when it is mounted again", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();

      store.sub(syncedAtom, () => {})();
      backend.receive({ count: 5, label: "b" });
      store.sub(syncedAtom, () => {});

      expect(store.get(counterAtom)).toEqual({ count: 5, label: "b" });

      backend.receive({ count: 6, label: "c" });
      expect(store.get(counterAtom)).toEqual({ count: 6, label: "c" });

      store.set(syncedAtom, { count: 7, label: "c" });
      expect(backend.read()).toEqual({ count: 7, label: "c" });
    });

    it("stays connected through an unmount and mount in one tick", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();

      store.sub(syncedAtom, () => {})();
      store.sub(syncedAtom, () => {});

      store.set(syncedAtom, { count: 1, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });
      backend.receive({ count: 2, label: "b" });
      expect(store.get(counterAtom)).toEqual({ count: 2, label: "b" });
    });

    it("drops an edit made while unmounted for a key the backend holds", () => {
      const counterAtom = atom<Record<string, unknown>>({ count: 0 });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();

      store.sub(syncedAtom, () => {})();
      store.set(syncedAtom, { count: 1, added: true });
      store.sub(syncedAtom, () => {});

      expect(store.get(counterAtom)).toEqual({ count: 0, added: true });
      expect(backend.read()).toEqual({ count: 0, added: true });
    });
  });

  describe("stores", () => {
    it("works with the default store", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = getDefaultStore();

      const unsubscribe = store.sub(syncedAtom, () => {});
      store.set(counterAtom, { count: 1, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });

      unsubscribe();
    });

    it("syncs each store it is mounted in, one after another", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const first = createStore();
      const second = createStore();

      const unsubscribeFirst = first.sub(syncedAtom, () => {});
      first.set(counterAtom, { count: 1, label: "a" });
      unsubscribeFirst();

      const unsubscribeSecond = second.sub(syncedAtom, () => {});
      expect(second.get(counterAtom)).toEqual({ count: 1, label: "a" });
      second.set(counterAtom, { count: 2, label: "b" });
      expect(backend.read()).toEqual({ count: 2, label: "b" });
      expect(first.get(counterAtom)).toEqual({ count: 1, label: "a" });
      unsubscribeSecond();

      first.sub(syncedAtom, () => {});
      expect(first.get(counterAtom)).toEqual({ count: 2, label: "b" });
    });

    it("rejects a second store while the first is mounted", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const first = createStore();
      const second = createStore();
      first.sub(syncedAtom, () => {});
      second.set(counterAtom, { count: 9, label: "second" });

      const errors = errorsFrom(() => second.sub(syncedAtom, () => {}));

      expect(errors).toHaveLength(1);
      expect(String(errors[0])).toMatch(/one store at a time/);
      expect(String(errors[0])).toMatch(/skips its own writes/);
      expect(String(errors[0])).toMatch(/its own backend on the same document/);
      expect(second.get(counterAtom)).toEqual({ count: 9, label: "second" });
    });

    it("keeps the first store syncing after rejecting a second", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const first = createStore();
      first.sub(syncedAtom, () => {});

      errorsFrom(() => createStore().sub(syncedAtom, () => {}));

      first.set(counterAtom, { count: 1, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });
      backend.receive({ count: 2, label: "b" });
      expect(first.get(counterAtom)).toEqual({ count: 2, label: "b" });
    });

    it("lets another store mount once the first has unmounted", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const first = createStore();
      const third = createStore();
      const unsubscribe = first.sub(syncedAtom, () => {});
      errorsFrom(() => createStore().sub(syncedAtom, () => {}));

      unsubscribe();
      third.sub(syncedAtom, () => {});

      third.set(counterAtom, { count: 3, label: "c" });
      expect(backend.read()).toEqual({ count: 3, label: "c" });
    });

    it("still rejects a second store after an unmount and mount in one tick", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const syncedAtom = atomWithSync(counterAtom, {
        backend: createMemoryBackend(),
      });
      const first = createStore();

      first.sub(syncedAtom, () => {})();
      first.sub(syncedAtom, () => {});

      const errors = errorsFrom(() => createStore().sub(syncedAtom, () => {}));
      expect(String(errors[0])).toMatch(/one store at a time/);
    });

    it("lets another store mount after a connect failed", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const read = vi.spyOn(backend, "read").mockImplementationOnce(() => {
        throw new Error("read failed");
      });
      const second = createStore();

      errorsFrom(() => createStore().sub(syncedAtom, () => {}));
      read.mockRestore();
      second.sub(syncedAtom, () => {});

      second.set(counterAtom, { count: 1, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });
    });
  });

  describe("failures", () => {
    it("throws a failed connect to the caller that mounted it", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const failure = new Error("read failed");
      vi.spyOn(backend, "read").mockImplementation(() => {
        throw failure;
      });
      const syncedAtom = atomWithSync(counterAtom, { backend });

      const errors = errorsFrom(() => createStore().sub(syncedAtom, () => {}));

      expect(errors).toEqual([failure]);
    });
  });

  describe("targets", () => {
    it("syncs a record of atoms as one state", () => {
      const todosAtom = atom<string[]>([]);
      const filterAtom = atom("all");
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(
        { todos: todosAtom, filter: filterAtom },
        { backend },
      );
      const store = createStore();

      store.sub(syncedAtom, () => {});
      expect(backend.read()).toEqual({ todos: [], filter: "all" });

      store.set(todosAtom, ["a"]);
      expect(backend.read()).toEqual({ todos: ["a"], filter: "all" });

      backend.receive({ todos: ["b"], filter: "done" });
      expect(store.get(todosAtom)).toEqual(["b"]);
      expect(store.get(filterAtom)).toBe("done");
      expect(store.get(syncedAtom)).toEqual({ todos: ["b"], filter: "done" });
    });

    it("forwards a write to the target's own arguments", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();
      store.sub(syncedAtom, () => {});

      store.set(syncedAtom, (prev) => ({ ...prev, count: prev.count + 1 }));

      expect(store.get(syncedAtom)).toEqual({ count: 1, label: "a" });
      expect(backend.read()).toEqual({ count: 1, label: "a" });
    });

    it("returns what the target's write returns", () => {
      const counterAtom = atom({ count: 0 });
      const incrementAtom = atom(
        (get) => get(counterAtom),
        (get, set, next: { count: number }) => {
          set(counterAtom, next);
          return get(counterAtom).count;
        },
      );
      const syncedAtom = atomWithSync(incrementAtom, {
        backend: createMemoryBackend(),
      });

      expect(createStore().set(syncedAtom, { count: 3 })).toBe(3);
    });

    it("syncs a derived writable root", () => {
      const countAtom = atom(0);
      const labelAtom = atom("a");
      const rootAtom = atom(
        (get) => ({ count: get(countAtom), label: get(labelAtom) }),
        (_get, set, next: Counter) => {
          set(countAtom, next.count);
          set(labelAtom, next.label);
        },
      );
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(rootAtom, { backend });
      const store = createStore();

      store.sub(syncedAtom, () => {});
      store.set(countAtom, 1);
      expect(backend.read()).toEqual({ count: 1, label: "a" });

      backend.receive({ count: 2, label: "b" });
      expect(store.get(labelAtom)).toBe("b");
    });

    it("does not sync when only a record member or the target is mounted", () => {
      const todosAtom = atom<string[]>([]);
      const backend = createMemoryBackend();
      const counterAtom = atom({ count: 0 });
      const counterBackend = createMemoryBackend();
      atomWithSync({ todos: todosAtom }, { backend });
      atomWithSync(counterAtom, { backend: counterBackend });
      const store = createStore();

      store.sub(todosAtom, () => {});
      store.sub(counterAtom, () => {});

      expect(backend.read()).toEqual({});
      expect(counterBackend.read()).toEqual({});
    });

    it("starts syncing when an atom derived from it is mounted", () => {
      const todosAtom = atom<string[]>([]);
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync({ todos: todosAtom }, { backend });
      const countAtom = atom((get) => get(syncedAtom).todos.length);
      const store = createStore();

      const unsubscribe = store.sub(countAtom, () => {});
      expect(backend.read()).toEqual({ todos: [] });

      unsubscribe();
      store.set(todosAtom, ["a"]);
      expect(backend.read()).toEqual({ todos: [] });
    });
  });

  describe("options", () => {
    it("passes filter to the engine", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, {
        backend,
        filter: (key) => key === "count",
      });

      createStore().sub(syncedAtom, () => {});

      expect(backend.read()).toEqual({ count: 0 });
    });

    it("passes omit to the engine", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, {
        backend,
        omit: ["label"],
      });

      createStore().sub(syncedAtom, () => {});

      expect(backend.read()).toEqual({ count: 0 });
    });

    it("passes seed to the engine", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend, seed: "never" });

      createStore().sub(syncedAtom, () => {});

      expect(backend.read()).toEqual({});
    });

    it("passes schedule to the engine", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const flushes: (() => void)[] = [];
      const syncedAtom = atomWithSync(counterAtom, {
        backend,
        schedule: (flush) => flushes.push(flush),
      });
      const store = createStore();
      store.sub(syncedAtom, () => {});

      backend.receive({ count: 1, label: "a" });
      expect(store.get(counterAtom)).toEqual({ count: 0, label: "a" });

      flushes[0]?.();
      expect(store.get(counterAtom)).toEqual({ count: 1, label: "a" });
    });

    it("passes onError to the engine", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const backend = createMemoryBackend();
      const onError = vi.fn();
      const syncedAtom = atomWithSync(counterAtom, { backend, onError });
      const store = createStore();
      store.sub(syncedAtom, () => {});
      const failure = new Error("write failed");
      vi.spyOn(backend, "write").mockImplementation(() => {
        throw failure;
      });

      store.set(syncedAtom, { count: 1, label: "a" });

      expect(onError).toHaveBeenCalledWith(failure, "backend");
    });
  });

  describe("types", () => {
    it("keeps the target's value, arguments and result", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const syncedAtom = atomWithSync(counterAtom, {
        backend: createMemoryBackend(),
      });

      expectTypeOf(syncedAtom).toEqualTypeOf<
        WritableAtom<Counter, [Counter | ((prev: Counter) => Counter)], void>
      >();
    });

    it("types a record's state from its atoms", () => {
      const syncedAtom = atomWithSync(
        { todos: atom<string[]>([]), filter: atom("all") },
        { backend: createMemoryBackend() },
      );

      expectTypeOf(createStore().get(syncedAtom)).toEqualTypeOf<{
        todos: string[];
        filter: string;
      }>();
    });

    it("checks key names against the state and takes no connect mode", () => {
      const counterAtom = atom<Counter>({ count: 0, label: "a" });
      const todosAtom = atom<string[]>([]);
      const backend = createMemoryBackend();

      atomWithSync(counterAtom, { backend, keys: ["count"] });
      atomWithSync({ todos: todosAtom }, { backend, omit: ["todos"] });
      // @ts-expect-error `missing` is not a key of the state
      atomWithSync(counterAtom, { backend, keys: ["missing"] });
      // @ts-expect-error `missing` is not a key of the record
      atomWithSync({ todos: todosAtom }, { backend, omit: ["missing"] });
      // @ts-expect-error `keys` and `omit` exclude each other
      atomWithSync(counterAtom, { backend, keys: ["count"], omit: ["label"] });
      // @ts-expect-error the atom connects when it is mounted
      atomWithSync(counterAtom, { backend, connect: "manual" });
    });
  });

  describe("with a derived atom focused on a slice", () => {
    it("syncs the slice alone, leaving the rest of the base atom untouched", () => {
      const baseAtom = atom({
        counter: { count: 0, label: "a" } as Counter,
        ui: { open: false },
      });
      const counterAtom = atom(
        (get) => get(baseAtom).counter,
        (get, set, counter: Counter) =>
          set(baseAtom, { ...get(baseAtom), counter }),
      );
      const backend = createMemoryBackend();
      const syncedAtom = atomWithSync(counterAtom, { backend });
      const store = createStore();
      store.sub(syncedAtom, () => {});
      const write = vi.spyOn(backend, "write");

      store.set(baseAtom, (base) => ({ ...base, ui: { open: true } }));

      expect(write).not.toHaveBeenCalled();

      const { ui } = store.get(baseAtom);
      backend.receive({ count: 7, label: "z" });

      expect(store.get(baseAtom).counter).toEqual({ count: 7, label: "z" });
      expect(store.get(baseAtom).ui).toBe(ui);
      expect(write).not.toHaveBeenCalled();

      store.set(baseAtom, (base) => ({
        ...base,
        counter: { count: 8, label: "z" },
      }));

      expect(backend.read()).toEqual({ count: 8, label: "z" });
    });
  });
});
