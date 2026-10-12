import { describe, expect, it } from "vitest";
import { patchState } from "../patching.js";
import { deepFreeze, prototypeHijacks, snapshot } from "./helpers.js";

describe("patchState", () => {
  it("returns the same reference when nothing changed", () => {
    const state = { a: [1, 2], b: "x", o: { n: null } };

    expect(patchState(state, { a: [1, 2], b: "x", o: { n: null } })).toBe(
      state,
    );
  });

  it("returns the same reference for a NaN that stays NaN", () => {
    const state = { progress: NaN, list: [NaN] };

    expect(patchState(state, { progress: NaN, list: [NaN] })).toBe(state);
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

    const result = patchState(oldState, newState);

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

    const result = patchState(oldState, newState);

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

  it("patches frozen state", () => {
    const oldState = deepFreeze({ list: [{ id: "1", done: false }] });

    expect(Object.isFrozen(oldState.list[0])).toBe(true);
    expect(patchState(oldState, { list: [{ id: "1", done: true }] })).toEqual({
      list: [{ id: "1", done: true }],
    });
  });

  it("leaves out __proto__ keys at any depth of inserted and updated values", () => {
    const newState = JSON.parse(
      '{"todos":[{"id":"1","__proto__":{"isAdmin":true}},' +
        '{"id":"2","__proto__":{"isAdmin":true},"tags":[{"__proto__":{"isAdmin":true}}]}],' +
        '"v":{"__proto__":{"isAdmin":true}}}',
    );
    const newSnapshot = snapshot(newState);

    const result = patchState({ todos: [{ id: "1" }], v: "x" }, newState);

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

    const result = patchState<Record<string, unknown>>({}, { settings });

    expect(JSON.stringify(result)).toBe('{"settings":{"theme":"dark"}}');
    expect(prototypeHijacks(result)).toEqual([]);
  });

  it("shares inserted values that hold no __proto__ key", () => {
    const item = { id: "2", tags: ["a"] };

    const result = patchState(
      { todos: [{ id: "1" }] },
      { todos: [{ id: "1" }, item] },
    );

    expect(result.todos[1]).toBe(item);
  });

  it("patches nested arrays inside objects inside arrays", () => {
    const oldState = { todos: [{ id: "1", tags: ["a"] }] };
    const newState = {
      todos: [
        { id: "1", tags: ["a", "b"] },
        { id: "2", tags: [] },
      ],
    };

    expect(patchState(oldState, newState)).toEqual(newState);
  });
});
