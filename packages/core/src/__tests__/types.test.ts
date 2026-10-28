import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defaultSyncFilter,
  type CrdtBackend,
  type JsonObject,
  type JsonObjectInput,
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
