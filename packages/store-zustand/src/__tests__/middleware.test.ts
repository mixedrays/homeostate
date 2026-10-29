import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { create } from "zustand";
import {
  createJSONStorage,
  devtools,
  persist,
  subscribeWithSelector,
  type StateStorage,
} from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import type { SyncEngine } from "@homeostate/core";
import { homeostate } from "../index.js";

interface CounterState {
  count: number;
  increment: () => void;
}

const createCounter = (backend: MemoryBackend) =>
  createStore<CounterState>()(
    homeostate(
      (set) => ({
        count: 0,
        increment: () => set((s) => ({ count: s.count + 1 })),
      }),
      { backend },
    ),
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

  it("forwards the engine's sync events and synced state", () => {
    const backend = createMemoryBackend();
    const store = createStore<CounterState>()(
      homeostate(
        (set) => ({
          count: 0,
          increment: () => set((s) => ({ count: s.count + 1 })),
        }),
        { backend, connect: "manual" },
      ),
    );
    const events: string[] = [];
    const unsubscribe = store.homeostate.subscribe((event) =>
      events.push(event),
    );

    expect(store.homeostate.getSyncedState()).toEqual({ count: 0 });
    store.homeostate.connect();
    store.getState().increment();
    backend.receive({ count: 5 });
    store.homeostate.disconnect();
    unsubscribe();
    store.homeostate.connect();

    expect(events).toEqual(["connect", "local", "remote", "disconnect"]);
    expect(store.homeostate.getSyncedState()).toEqual({ count: 5 });
  });

  it("leaves the backend untouched until connect() with the manual connect mode", () => {
    const backend = createMemoryBackend({ count: 7 });
    const calls = ["read", "write", "subscribe"] as const;
    const spies = calls.map((method) => vi.spyOn(backend, method));

    const store = createStore<CounterState>()(
      homeostate(
        (set) => ({
          count: 0,
          increment: () => set((s) => ({ count: s.count + 1 })),
        }),
        { backend, connect: "manual" },
      ),
    );
    store.getState().increment();

    expect(store.getState().count).toBe(1);
    expect(store.homeostate.isConnected()).toBe(false);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);

    store.homeostate.connect();
    expect(store.getState().count).toBe(7);
    store.getState().increment();
    expect(backend.read()).toEqual({ count: 8 });
  });

  it("composes with devtools, subscribeWithSelector and persist, keeping their types", () => {
    const backend = createMemoryBackend({ count: 7 });
    const { storage } = createStorage({}, false);

    const useStore = create<CounterState>()(
      devtools(
        subscribeWithSelector(
          homeostate(
            persist(
              (set) => ({
                count: 0,
                increment: () => set((s) => ({ count: s.count + 1 })),
              }),
              { name: "c", storage: createJSONStorage(() => storage) },
            ),
            { backend, connect: "manual" },
          ),
        ),
        { enabled: false },
      ),
    );
    const counts: number[] = [];
    useStore.subscribe(
      (state) => state.count,
      (count) => counts.push(count),
    );
    useStore.homeostate.connect();

    expectTypeOf(useStore.homeostate).toEqualTypeOf<SyncEngine>();
    expectTypeOf(useStore.persist.hasHydrated).returns.toEqualTypeOf<boolean>();
    expect(useStore.persist.hasHydrated()).toBe(true);
    expect(counts).toEqual([7]);
    useStore.getState().increment();
    expect(backend.read()).toEqual({ count: 8 });
  });

  it("names the new argument order when called with the backend first", () => {
    const backend = createMemoryBackend();
    const call = homeostate as unknown as (...args: unknown[]) => unknown;

    expect(() => call(backend, () => ({ count: 0 }))).toThrow(
      "homeostate(creator, { backend })",
    );
  });

  it("infers the state type in the documented curried form", () => {
    const useStore = create<CounterState>()(
      homeostate(
        (set) => ({
          count: 0,
          increment: () => set((s) => ({ count: s.count + 1 })),
        }),
        { backend: createMemoryBackend() },
      ),
    );

    expectTypeOf(useStore.getState().count).toEqualTypeOf<number>();
  });

  it("keeps the keys omit names local, checking their names against the state", () => {
    interface DraftState extends CounterState {
      draft: string;
      setDraft: (draft: string) => void;
    }
    const backend = createMemoryBackend({ count: 3, draft: "room" });
    const useStore = create<DraftState>()(
      homeostate(
        (set) => ({
          count: 0,
          draft: "",
          increment: () => set((s) => ({ count: s.count + 1 })),
          setDraft: (draft) => set({ draft }),
        }),
        { backend, omit: ["draft"] },
      ),
    );

    expect(useStore.getState()).toMatchObject({ count: 3, draft: "" });
    useStore.getState().setDraft("local");
    expect(backend.read()).toEqual({ count: 3 });

    create<DraftState>()(
      homeostate(
        (set) => ({
          count: 0,
          draft: "",
          increment: () => set((s) => ({ count: s.count + 1 })),
          setDraft: (draft) => set({ draft }),
        }),
        // @ts-expect-error "drafts" is not a key of DraftState.
        { backend: createMemoryBackend(), omit: ["drafts"] },
      ),
    );
  });
});

describe("homeostate middleware with persist", () => {
  it("lets a room with state win over state hydrated from async storage", async () => {
    const room = createMemoryBackend({ count: 7 });
    const { storage, storedCount } = createStorage({ c: persisted(42) }, true);

    const store = createStore<Count>()(
      homeostate(
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room },
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
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room },
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
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room },
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
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room },
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
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room },
      ),
    );
    store.homeostate.disconnect();
    await tick();

    expect(store.homeostate.isConnected()).toBe(false);
    expect(store.getState().count).toBe(42);
    expect(room.read()).toEqual({ count: 7 });
  });

  it("connects once a retried hydration succeeds after one failed", async () => {
    const room = createMemoryBackend({ count: 7 });
    const { storage } = createStorage({ c: persisted(42) }, true);
    const getItem = storage.getItem;
    storage.getItem = () => Promise.reject(new Error("storage unavailable"));

    const store = createStore<Count>()(
      homeostate(
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room },
      ),
    );
    await tick();
    expect(store.homeostate.isConnected()).toBe(false);

    storage.getItem = getItem;
    await store.persist.rehydrate();

    expect(store.homeostate.isConnected()).toBe(true);
    expect(store.getState().count).toBe(7);
  });

  it("waits for hydration when connected manually before it finished", async () => {
    const room = createMemoryBackend({ count: 7 });
    const { storage, storedCount } = createStorage({ c: persisted(42) }, true);

    const store = createStore<Count>()(
      homeostate(
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room, connect: "manual" },
      ),
    );
    store.homeostate.connect();
    expect(store.homeostate.isConnected()).toBe(false);
    await tick();

    expect(store.homeostate.isConnected()).toBe(true);
    expect(room.read()).toEqual({ count: 7 });
    expect(store.getState().count).toBe(7);
    expect(storedCount("c")).toBe(7);
  });

  it("stays disconnected after hydration with the manual connect mode", async () => {
    const room = createMemoryBackend();
    const { storage } = createStorage({ c: persisted(42) }, true);

    const store = createStore<Count>()(
      homeostate(
        persist(() => ({ count: 0 }), {
          name: "c",
          storage: createJSONStorage(() => storage),
        }),
        { backend: room, connect: "manual" },
      ),
    );
    await tick();

    expect(store.homeostate.isConnected()).toBe(false);
    expect(store.getState().count).toBe(42);
    expect(room.read()).toEqual({});
  });

  it("throws naming the right order when persist wraps the middleware", () => {
    const room = createMemoryBackend();
    const { storage } = createStorage({ c: persisted(42) }, false);

    expect(() =>
      createStore<Count>()(
        persist(
          homeostate(() => ({ count: 0 }), { backend: room }),
          { name: "c", storage: createJSONStorage(() => storage) },
        ),
      ),
    ).toThrow("homeostate(persist(creator, options), { backend })");
  });
});
