import { describe, expect, expectTypeOf, it } from "vitest";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { homeostate } from "../index.js";

interface CounterState {
  count: number;
  increment: () => void;
}

const createCounter = (backend: MemoryBackend) =>
  createStore<CounterState>()(
    homeostate(backend, (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    })),
  );

type Count = { count: number };

const persisted = (count: number): string =>
  JSON.stringify({ state: { count }, version: 0 });

/** A `StateStorage` over a map, answering either synchronously or with promises. */
const createStorage = (initial: Record<string, string>, async: boolean) => {
  const items = new Map(Object.entries(initial));
  const answer = <T>(value: T) => (async ? Promise.resolve(value) : value);
  const storage = {
    getItem: (name: string) => answer(items.get(name) ?? null),
    setItem: (name: string, value: string) => {
      items.set(name, value);
      return answer(undefined);
    },
    removeItem: (name: string) => {
      items.delete(name);
      return answer(undefined);
    },
  } as StateStorage;
  /** The count stored under `name`, or `undefined` when nothing is stored. */
  const storedCount = (name: string): number | undefined => {
    const item = items.get(name);
    return item === undefined
      ? undefined
      : (JSON.parse(item) as { state: Count }).state.count;
  };
  return { storage, storedCount };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("homeostate middleware", () => {
  it("seeds the backend, writes store changes, and applies remote changes", () => {
    const backend = createMemoryBackend();
    const store = createCounter(backend);
    expect(backend.read()).toEqual({ count: 0 });

    store.getState().increment();
    expect(backend.read()).toEqual({ count: 1 });

    backend.receive({ count: 5 });
    expect(store.getState().count).toBe(5);
    expect(typeof store.getState().increment).toBe("function");
  });

  it("adopts a non-empty backend as the initial state", () => {
    const backend = createMemoryBackend({ count: 7 });

    const store = createCounter(backend);

    expect(store.getState().count).toBe(7);
    expect(backend.read()).toEqual({ count: 7 });
  });

  it("exposes the engine so the store can disconnect from the backend", () => {
    const backend = createMemoryBackend();
    const store = createCounter(backend);
    expect(store.homeostate.isConnected()).toBe(true);

    store.homeostate.disconnect();
    store.getState().increment();
    expect(backend.read()).toEqual({ count: 0 });

    backend.receive({ count: 9 });
    expect(store.getState().count).toBe(1);
    expect(store.homeostate.isConnected()).toBe(false);
  });

  it("infers the state type in the documented curried form", () => {
    const useStore = create<CounterState>()(
      homeostate(createMemoryBackend(), (set) => ({
        count: 0,
        increment: () => set((s) => ({ count: s.count + 1 })),
      })),
    );

    expectTypeOf(useStore.getState().count).toEqualTypeOf<number>();
  });
});

describe("homeostate middleware with persist", () => {
  it("lets a room with state win over state hydrated from async storage", async () => {
    const room = createMemoryBackend({ count: 7 });
    const { storage, storedCount } = createStorage({ c: persisted(42) }, true);

    const store = createStore<Count>()(
      homeostate(
        room,
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
      ),
    );
    await tick();

    expect(room.read()).toEqual({ count: 7 });
    expect(store.getState().count).toBe(7);
    expect(storedCount("c")).toBe(7);
  });

  it("seeds an empty room with state hydrated from sync storage", () => {
    const room = createMemoryBackend();
    const { storage, storedCount } = createStorage({ c: persisted(42) }, false);

    const store = createStore<Count>()(
      homeostate(
        room,
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
      ),
    );

    expect(store.getState().count).toBe(42);
    expect(room.read()).toEqual({ count: 42 });
    expect(storedCount("c")).toBe(42);
    expect(store.homeostate.isConnected()).toBe(true);
    expect(store.persist.hasHydrated()).toBe(true);
  });

  it("lets a room with state win over state hydrated from sync storage", () => {
    const room = createMemoryBackend({ count: 7 });
    const { storage, storedCount } = createStorage({ c: persisted(42) }, false);

    const store = createStore<Count>()(
      homeostate(
        room,
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
      ),
    );

    expect(store.getState().count).toBe(7);
    expect(room.read()).toEqual({ count: 7 });
    expect(storedCount("c")).toBe(7);
  });

  it("seeds an empty room with state hydrated from async storage", async () => {
    const room = createMemoryBackend();
    const { storage, storedCount } = createStorage({ c: persisted(42) }, true);

    const store = createStore<Count>()(
      homeostate(
        room,
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
      ),
    );
    expect(store.homeostate.isConnected()).toBe(false);
    expect(room.read()).toEqual({});
    await tick();

    expect(store.homeostate.isConnected()).toBe(true);
    expect(store.getState().count).toBe(42);
    expect(room.read()).toEqual({ count: 42 });
    expect(storedCount("c")).toBe(42);
  });

  it("stays disconnected after hydration when disconnected before it finished", async () => {
    const room = createMemoryBackend({ count: 7 });
    const { storage } = createStorage({ c: persisted(42) }, true);

    const store = createStore<Count>()(
      homeostate(
        room,
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
      ),
    );
    store.homeostate.disconnect();
    await tick();

    expect(store.homeostate.isConnected()).toBe(false);
    expect(store.getState().count).toBe(42);
    expect(room.read()).toEqual({ count: 7 });
  });

  it("throws naming the right order when persist wraps the middleware", () => {
    const room = createMemoryBackend();
    const { storage } = createStorage({ c: persisted(42) }, false);

    expect(() =>
      createStore<Count>()(
        persist(
          homeostate(room, () => ({ count: 0 })),
          { name: "c", storage: createJSONStorage(() => storage) },
        ),
      ),
    ).toThrow("homeostate(backend, persist(creator, options))");
  });
});
