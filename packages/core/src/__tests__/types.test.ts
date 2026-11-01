import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createSyncEngine,
  defaultSyncFilter,
  scopeAdapter,
  type CrdtBackend,
  type JsonObject,
  type JsonObjectInput,
  type SetupOptions,
  type StoreAdapter,
  type SyncEngineConfig,
} from "../index.js";
import { createMemoryBackend } from "../testing.js";

/** State typed the way most apps type it, which has no index signature. */
interface TodoState {
  todos: { id: string; title: string }[];
  length: number;
}

const todoState = (): TodoState => ({
  todos: [{ id: "1", title: "a" }],
  length: 1,
});

describe("defaultSyncFilter", () => {
  it("excludes functions and classes", () => {
    expect(defaultSyncFilter("arrow", () => {})).toBe(false);
    expect(defaultSyncFilter("named", function named() {})).toBe(false);
    expect(defaultSyncFilter("cls", class {})).toBe(false);
  });

  it("keeps every other value regardless of the key", () => {
    for (const value of [
      0,
      1,
      "",
      "text",
      false,
      true,
      null,
      undefined,
      [],
      [1],
      {},
      { a: 1 },
    ]) {
      expect(defaultSyncFilter("key", value)).toBe(true);
    }
  });
});

// These checks run when the test files are type-checked, as `pnpm typecheck` does.
describe("JsonObjectInput", () => {
  it("accepts state typed with an interface where a backend takes state", () => {
    const backend = createMemoryBackend(todoState());
    backend.receive(todoState());
    const crdt: CrdtBackend = backend;
    crdt.write(todoState(), todoState());

    expect(backend.read()).toEqual(todoState());
  });

  it("accepts type aliases, JsonObjects and object literals", () => {
    expectTypeOf<{ count: number }>().toExtend<JsonObjectInput>();
    expectTypeOf<JsonObject>().toExtend<JsonObjectInput>();
    expectTypeOf<object>().toExtend<JsonObjectInput>();
    createMemoryBackend({ count: 1, label: "one" }).write({ count: 2 });
  });

  it("rejects arrays and primitives", () => {
    expectTypeOf<unknown[]>().not.toExtend<JsonObjectInput>();
    expectTypeOf<readonly number[]>().not.toExtend<JsonObjectInput>();
    expectTypeOf<Map<string, number>>().not.toExtend<JsonObjectInput>();
    expectTypeOf<string>().not.toExtend<JsonObjectInput>();
    expectTypeOf<number>().not.toExtend<JsonObjectInput>();
    expectTypeOf<boolean>().not.toExtend<JsonObjectInput>();
    expectTypeOf<null>().not.toExtend<JsonObjectInput>();
    expectTypeOf<undefined>().not.toExtend<JsonObjectInput>();

    // Never called: only its type errors matter.
    const misuse = (backend: CrdtBackend) => {
      // @ts-expect-error An array is not an object state.
      createMemoryBackend([1]);
      // @ts-expect-error A string is not an object state.
      createMemoryBackend().receive("todos");
      // @ts-expect-error null is not an object state.
      backend.write(null);
    };
    expect(misuse).toBeTypeOf("function");
  });

  it("reads a JsonObject, which an interface-typed state is read from through unknown", () => {
    const backend = createMemoryBackend(todoState());
    expectTypeOf(backend.read()).toEqualTypeOf<JsonObject>();
    // @ts-expect-error A JsonObject does not overlap an interface without an index signature.
    void (backend.read() as TodoState);

    const state = backend.read() as unknown as TodoState;
    expect(state.todos[0].title).toBe("a");
  });
});

describe("SyncEngineConfig", () => {
  /** A store adapter typed by `TodoState`, which is all the type checks below need. */
  const adapter = (): StoreAdapter<TodoState> => ({
    getState: todoState,
    setState: () => {},
    subscribe: () => () => {},
  });

  it("takes the state type from the adapter and type-checks keys and omit", () => {
    const backend = createMemoryBackend();
    createSyncEngine(backend, adapter(), { omit: ["length"] });
    createSyncEngine(backend, adapter(), { keys: ["todos"] });
    // @ts-expect-error "todo" is not a key of TodoState.
    createSyncEngine(backend, adapter(), { omit: ["todo"] });
    // @ts-expect-error "todo" is not a key of TodoState.
    createSyncEngine(backend, adapter(), { keys: ["todos", "todo"] });
    // @ts-expect-error keys and omit cannot be given together.
    createSyncEngine(backend, adapter(), { keys: ["todos"], omit: ["length"] });
  });

  it("accepts readonly key lists, such as an as const constant", () => {
    const LOCAL = ["length"] as const;
    const SYNCED: readonly "todos"[] = ["todos"];
    const backend = createMemoryBackend();
    createSyncEngine(backend, adapter(), { omit: LOCAL });
    createSyncEngine(backend, adapter(), { keys: SYNCED });
  });

  it("types the filter by the state, and takes existing string predicates and keys or omit", () => {
    const backend = createMemoryBackend();
    createSyncEngine(backend, adapter(), {
      filter: (key, value) => {
        expectTypeOf(key).toEqualTypeOf<"todos" | "length">();
        expectTypeOf(value).toEqualTypeOf<TodoState[keyof TodoState]>();
        return key !== "length";
      },
    });
    createSyncEngine(backend, adapter(), {
      filter: (key: string, value: unknown) =>
        defaultSyncFilter(key, value) && key !== "length",
      keys: ["todos"],
    });
    createSyncEngine(backend, adapter(), { filter: defaultSyncFilter });
  });

  it("types keys as strings and values as unknown without a state type", () => {
    type Filter = NonNullable<SyncEngineConfig["filter"]>;
    expectTypeOf<Parameters<Filter>>().toEqualTypeOf<[string, unknown]>();
    expectTypeOf<{ omit: string[] }>().toExtend<SyncEngineConfig>();
  });

  it("types SetupOptions by the state the same way", () => {
    const backend = createMemoryBackend();
    expectTypeOf({ backend, omit: ["length"] as const }).toExtend<
      SetupOptions<TodoState>
    >();
    expectTypeOf({ backend, omit: ["todo"] as const }).not.toExtend<
      SetupOptions<TodoState>
    >();
    expectTypeOf({
      backend,
      keys: ["todos"] as const,
      omit: ["length"] as const,
    }).not.toExtend<SetupOptions<TodoState>>();
  });
});

describe("scopeAdapter", () => {
  /** A slice typed with an interface, one the store may lack, and an array. */
  interface Root {
    state: TodoState;
    optional?: TodoState;
    list: string[];
    count: number;
  }

  const adapter = (): StoreAdapter<Root> => ({
    getState: () => ({ state: todoState(), list: [], count: 0 }),
    setState: () => {},
    subscribe: () => () => {},
  });

  const stateScope = {
    get: (root: Root) => root.state,
    set: (root: Root, state: TodoState) => ({ ...root, state }),
  };

  it("takes the slice's type from get", () => {
    expectTypeOf(
      scopeAdapter(adapter(), {
        get: (root) => root.state,
        set: (root, state) => ({ ...root, state }),
      }),
    ).toEqualTypeOf<StoreAdapter<TodoState>>();
  });

  it("types the engine's config by the slice", () => {
    const backend = createMemoryBackend();
    const scoped = scopeAdapter(adapter(), stateScope);
    createSyncEngine(backend, scoped, { keys: ["todos"] });
    // @ts-expect-error "count" is a key of the store, not of the slice.
    createSyncEngine(backend, scoped, { keys: ["count"] });
  });

  it("rejects an array slice, and takes one wrapped in an object", () => {
    const listScope = {
      get: (root: Root) => root.list,
      set: (root: Root, list: string[]) => ({ ...root, list }),
    };
    // @ts-expect-error an array is not an object the engine can sync.
    scopeAdapter(adapter(), listScope);
    scopeAdapter(adapter(), {
      get: (root) => ({ list: root.list }),
      set: (root, { list }) => ({ ...root, list }),
    });
  });

  it("rejects a slice that may be absent, and takes one with a fallback", () => {
    const optionalScope = {
      get: (root: Root) => root.optional,
      set: (root: Root, optional?: TodoState) => ({ ...root, optional }),
    };
    // @ts-expect-error `undefined` is not an object the engine can sync.
    scopeAdapter(adapter(), optionalScope);
    scopeAdapter(adapter(), {
      get: (root) => root.optional ?? todoState(),
      set: (root, optional) => ({ ...root, optional }),
    });
  });
});
