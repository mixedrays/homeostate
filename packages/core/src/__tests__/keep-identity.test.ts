import { describe, expect, it } from "vitest";
import { keepIdentity } from "../index.js";
import { deepFreeze, prototypeHijacks, snapshot } from "./helpers.js";

describe("keepIdentity", () => {
  it("returns the same reference when nothing changed", () => {
    const state = { a: [1, 2], b: "x", o: { n: null } };

    expect(keepIdentity(state, { a: [1, 2], b: "x", o: { n: null } })).toBe(
      state,
    );
  });

  it("returns the same reference for a NaN that stays NaN", () => {
    const state = { progress: NaN, list: [NaN] };

    expect(keepIdentity(state, { progress: NaN, list: [NaN] })).toBe(state);
  });

  it("never mutates its inputs", () => {
    const oldState = { todos: [{ id: "1", done: false }], term: "ab" };
    const newState = {
      todos: [
        { id: "1", done: true },
        { id: "2", done: false },
      ],
      term: "abc",
    };
    const oldSnapshot = snapshot(oldState);
    const newSnapshot = snapshot(newState);

    const result = keepIdentity(oldState, newState);

    expect(result).toEqual(newState);
    expect(oldState).toEqual(oldSnapshot);
    expect(newState).toEqual(newSnapshot);
  });

  it("copies every container along a changed path and shares the rest", () => {
    const oldState = {
      list: [{ id: "1" }, { id: "2" }],
      other: { keep: true },
      nested: { l: [{ x: 1 }, { x: 2 }] },
    };
    const newState = {
      list: [{ id: "1x" }, { id: "2" }],
      other: { keep: true },
      nested: { l: [{ x: 1 }, { x: 3 }] },
    };

    const result = keepIdentity(oldState, newState);

    expect(result).toEqual(newState);
    expect(result).not.toBe(oldState);
    expect(result.list).not.toBe(oldState.list);
    expect(result.list[0]).not.toBe(oldState.list[0]);
    expect(result.list[1]).toBe(oldState.list[1]);
    expect(result.other).toBe(oldState.other);
    expect(result.nested).not.toBe(oldState.nested);
    expect(result.nested.l[0]).toBe(oldState.nested.l[0]);
    expect(result.nested.l[1]).not.toBe(oldState.nested.l[1]);
  });

  it("builds on frozen state", () => {
    const oldState = deepFreeze({ list: [{ id: "1", done: false }] });

    expect(Object.isFrozen(oldState.list[0])).toBe(true);
    expect(keepIdentity(oldState, { list: [{ id: "1", done: true }] })).toEqual(
      {
        list: [{ id: "1", done: true }],
      },
    );
  });

  it("leaves out __proto__ keys at any depth of inserted and updated values", () => {
    const newState = JSON.parse(
      '{"todos":[{"id":"1","__proto__":{"isAdmin":true}},' +
        '{"id":"2","__proto__":{"isAdmin":true},"tags":[{"__proto__":{"isAdmin":true}}]}],' +
        '"v":{"__proto__":{"isAdmin":true}}}',
    );
    const newSnapshot = snapshot(newState);

    const result = keepIdentity({ todos: [{ id: "1" }], v: "x" }, newState);

    expect(JSON.stringify(result)).toBe(
      '{"todos":[{"id":"1"},{"id":"2","tags":[{}]}],"v":{}}',
    );
    expect(prototypeHijacks(result)).toEqual([]);
    expect(newState).toEqual(newSnapshot);
  });

  it("leaves out the __proto__ key of an object without a prototype", () => {
    const settings = Object.create(null) as Record<string, unknown>;
    // Without a prototype there is no `__proto__` setter, so this adds an own key.
    settings["__proto__"] = { isAdmin: true };
    settings.theme = "dark";

    const result = keepIdentity<Record<string, unknown>>({}, { settings });

    expect(JSON.stringify(result)).toBe('{"settings":{"theme":"dark"}}');
    expect(prototypeHijacks(result)).toEqual([]);
  });

  it("copies an object with another prototype into a plain object of its own entries, at any depth", () => {
    // What a library that builds objects by assignment makes of a peer's `__proto__` entry.
    const hijacked = <T extends object>(entries: T): T =>
      Object.assign(Object.create({ isAdmin: true }) as T, entries);
    const newState = {
      todos: [{ id: "1" }, hijacked({ id: "2", tags: [hijacked({ a: 1 })] })],
      settings: { layout: hijacked({ main: hijacked({ width: 2 }) }) },
    };

    const result = keepIdentity<Record<string, unknown>>(
      { todos: [{ id: "1" }] },
      newState,
    );

    expect(JSON.stringify(result)).toBe(
      '{"todos":[{"id":"1"},{"id":"2","tags":[{"a":1}]}],' +
        '"settings":{"layout":{"main":{"width":2}}}}',
    );
    expect(prototypeHijacks(result)).toEqual([]);
    expect(Object.getPrototypeOf(newState.todos[1])).toEqual({
      isAdmin: true,
    });
  });

  it("copies next whole into a plain object when the kinds differ and it has another prototype", () => {
    const newState = Object.assign(Object.create({ isAdmin: true }), {
      list: [],
    }) as object;

    const result = keepIdentity<unknown>(["a"], newState);

    expect(result).toEqual({ list: [] });
    expect(prototypeHijacks(result)).toEqual([]);
  });

  it("leaves arrays, binary values and objects without a prototype as they are", () => {
    const bytes = new Uint8Array([1, 2]);
    const list = [1, [2]];
    const bare = Object.assign(Object.create(null) as object, { a: 1 });

    const result = keepIdentity<Record<string, unknown>>(
      {},
      { bytes, list, bare },
    );

    expect(result.bytes).toBe(bytes);
    expect(result.list).toBe(list);
    expect(result.bare).toBe(bare);
  });

  it("keeps the identity of the items that shift when one is inserted at the top", () => {
    const oldState = { todos: [{ id: "1" }, { id: "2" }] };

    const result = keepIdentity(oldState, {
      todos: [{ id: "0" }, { id: "1" }, { id: "2" }],
    });

    expect(result.todos[1]).toBe(oldState.todos[0]);
    expect(result.todos[2]).toBe(oldState.todos[1]);
  });

  it("shares inserted values that hold no __proto__ key", () => {
    const item = { id: "2", tags: ["a"] };

    const result = keepIdentity(
      { todos: [{ id: "1" }] },
      { todos: [{ id: "1" }, item] },
    );

    expect(result.todos[1]).toBe(item);
  });

  it("edits nested arrays inside objects inside arrays", () => {
    const oldState = { todos: [{ id: "1", tags: ["a"] }] };
    const newState = {
      todos: [
        { id: "1", tags: ["a", "b"] },
        { id: "2", tags: [] },
      ],
    };

    expect(keepIdentity(oldState, newState)).toEqual(newState);
  });

  it("returns newState, without its __proto__ keys, when the kinds differ", () => {
    const list = [{ id: "1" }];
    const newState = JSON.parse('{"list":[],"__proto__":{"isAdmin":true}}');

    expect(keepIdentity<unknown>("todos", list)).toBe(list);
    const result = keepIdentity<unknown>(["a"], newState);
    expect(JSON.stringify(result)).toBe('{"list":[]}');
    expect(prototypeHijacks(result)).toEqual([]);
  });
});
