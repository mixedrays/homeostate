import { describe, expect, it } from "vitest";
import { mergeConcurrent, type TextPolicy } from "../index.js";
import { deepFreeze, prototypeHijacks } from "./helpers.js";

/** Merges frozen copies, so a test fails if the merge mutates its inputs. */
const merge = (
  base: unknown,
  local: unknown,
  remote: unknown,
  text?: TextPolicy,
): unknown =>
  mergeConcurrent(
    deepFreeze(base),
    deepFreeze(local),
    deepFreeze(remote),
    text === undefined ? undefined : { text },
  );

const everyString: TextPolicy = () => true;

describe("mergeConcurrent", () => {
  describe("records", () => {
    it("merges key by key, keeping each side's changes", () => {
      expect(
        merge(
          { a: 0, b: 0, c: 0, d: 0 },
          { a: 1, b: 0, c: 0 },
          { a: 0, b: 2, c: 0, d: 0, e: 2 },
        ),
      ).toEqual({ a: 1, b: 2, c: 0, e: 2 });
    });

    it("merges nested records key by key", () => {
      expect(
        merge(
          { todo: { title: "seed", done: false } },
          { todo: { title: "seed", done: true } },
          { todo: { title: "changed", done: false } },
        ),
      ).toEqual({ todo: { title: "changed", done: true } });
    });

    it("ignores __proto__ keys on every side", () => {
      const merged = merge(
        JSON.parse('{ "a": 0, "__proto__": { "x": 0 } }'),
        JSON.parse('{ "a": 1, "__proto__": { "isAdmin": true } }'),
        JSON.parse('{ "a": 0, "b": 2, "__proto__": { "isAdmin": 2 } }'),
      );

      expect(merged).toEqual({ a: 1, b: 2 });
      expect(prototypeHijacks(merged)).toEqual([]);
    });

    it("reads undefined and function entries as absent, as JSON would store them", () => {
      const fn = (): number => 1;

      expect(
        merge({ a: 1 }, { a: 3, f: fn, u: undefined }, { a: 2, c: 1 }),
      ).toStrictEqual({ a: 3, c: 1 });
      expect(merge({ a: 1, f: 1 }, { a: 2, f: 1 }, { a: 1, f: fn })).toEqual({
        a: 2,
      });
    });
  });

  describe("arrays", () => {
    it("lands an edit on its item after the other side's inserts and deletes", () => {
      expect(
        merge(
          [1, 2, { v: 0 }, 3],
          [1, 2, { v: 1 }, 3],
          ["a", { v: 0 }, 3, "b"],
        ),
      ).toEqual(["a", { v: 1 }, 3, "b"]);
      expect(
        merge(
          [1, 2, { v: 0 }, 3],
          ["a", { v: 0 }, 3, "b"],
          [1, 2, { v: 1 }, 3],
        ),
      ).toEqual(["a", { v: 1 }, 3, "b"]);
    });

    it("keeps both sides' inserts at one place, the remote ones first", () => {
      expect(merge([1, 2], [1, "L", 2], [1, "R", 2])).toEqual([1, "R", "L", 2]);
      expect(merge([], ["L1", "L2"], ["R"])).toEqual(["R", "L1", "L2"]);
    });

    it("reads undefined and function items as null, as JSON would store them", () => {
      expect(merge([{ x: 1 }], [{ x: 2 }], [undefined])).toEqual([{ x: 2 }]);
      expect(merge([1, 2], [1, 3], [() => 1, 2])).toEqual([null, 3]);
    });
  });

  describe("conflicts", () => {
    it("keeps the local value where both sides changed one value", () => {
      expect(merge({ a: 0 }, { a: 1 }, { a: 2 })).toEqual({ a: 1 });
      expect(merge([1, 2, 3], [1, 5, 3], [1, 8, 3])).toEqual([1, 5, 3]);
      expect(merge({ a: { b: 1 } }, { a: "local" }, { a: [1] })).toEqual({
        a: "local",
      });
      expect(merge({ a: { b: 1 } }, { a: { b: 2 } }, { a: "remote" })).toEqual({
        a: { b: 2 },
      });
    });

    it("drops a local change in place to a value the remote side deleted", () => {
      expect(
        merge(
          { todo: { done: false }, n: 0 },
          { todo: { done: true }, n: 0 },
          {
            n: 1,
          },
        ),
      ).toEqual({ n: 1 });
      expect(merge([[1], 2], [[1, 9], 2], [2])).toEqual([2]);
    });

    it("keeps a local replacement of a value the remote side deleted", () => {
      expect(merge({ a: { b: 1 }, n: 0 }, { a: 5, n: 0 }, { n: 1 })).toEqual({
        n: 1,
        a: 5,
      });
      expect(merge([1, 2, 3], [1, 5, 3], [1, 3])).toEqual([1, 5, 3]);
    });

    it("keeps a value the local side deleted deleted, whatever the remote side did", () => {
      expect(
        merge({ a: { b: 1 }, n: 0 }, { n: 0 }, { a: { b: 2, c: 3 }, n: 1 }),
      ).toEqual({ n: 1 });
      expect(merge([1, { v: 0 }, 3], [1, 3], [1, { v: 2 }, 3])).toEqual([1, 3]);
    });
  });

  describe("strings", () => {
    it("replaces strings whole without a text policy", () => {
      expect(merge({ s: "abc" }, { s: "abcX" }, { s: "Yabc" })).toEqual({
        s: "abcX",
      });
      expect(merge({ s: "abc", n: 0 }, { s: "abX", n: 0 }, { n: 1 })).toEqual({
        n: 1,
        s: "abX",
      });
      expect(merge(["abc"], ["abX"], [])).toEqual(["abX"]);
    });

    it("merges text by UTF-16 unit with a text policy", () => {
      expect(
        merge({ s: "abc" }, { s: "abcX" }, { s: "Yabc" }, everyString),
      ).toEqual({ s: "YabcX" });
      expect(
        merge({ s: "abc" }, { s: "abXc" }, { s: "abYc" }, everyString),
      ).toEqual({ s: "abYXc" });
      expect(
        merge("hello world", "Hello world", "hello there", everyString),
      ).toBe("Hello there");
      expect(merge("a😀b", "a😀bX", "Ya😀b", everyString)).toBe("Ya😀bX");
    });

    it("merges as text only the strings the policy marks, by their path", () => {
      const text: TextPolicy = (path) =>
        path[0] === "todos" && path[2] === "title";
      const base = { id: "abc", todos: [{ title: "abc", tag: "abc" }] };

      expect(
        merge(
          base,
          { id: "abcX", todos: [{ title: "abcX", tag: "abcX" }] },
          { id: "Yabc", todos: [{ title: "Yabc", tag: "Yabc" }] },
          text,
        ),
      ).toEqual({ id: "abcX", todos: [{ title: "YabcX", tag: "abcX" }] });
    });

    it("drops a text edit to a value the remote side deleted", () => {
      expect(
        merge({ s: "abc", n: 0 }, { s: "abX", n: 0 }, { n: 1 }, everyString),
      ).toEqual({ n: 1 });
      expect(merge(["abc", 1], ["abX", 1], [1], everyString)).toEqual([1]);
    });

    it("keeps a text replaced by another kind against a remote delete", () => {
      expect(
        merge({ s: "abc", n: 0 }, { s: 5, n: 0 }, { n: 1 }, everyString),
      ).toEqual({ n: 1, s: 5 });
    });
  });

  describe("equal sides", () => {
    it("returns a change only one side made by identity", () => {
      const local = { a: [1, 2], b: { c: 1 } };
      const remote = { a: [1, 2, 3], b: { c: 1 } };

      expect(merge({ a: [1, 2], b: { c: 1 } }, local, remote)).toBe(remote);
      expect(merge({ a: [1, 2], b: { c: 1 } }, remote, local)).toBe(remote);
    });

    it("keeps the very values each side changed when both changed some", () => {
      const list = [1, 2, 3];
      const todo = { done: true };
      const merged = merge(
        { list: [1, 2], todo: { done: false } },
        { list: [1, 2], todo },
        { list, todo: { done: false } },
      ) as { list: unknown; todo: unknown };

      expect(merged.list).toBe(list);
      expect(merged.todo).toBe(todo);
    });

    it("collapses the same item both sides inserted at one place into one", () => {
      expect(merge([1], [1, 2], [1, 2])).toEqual([1, 2]);
      expect(
        merge(
          { list: [1], n: 0 },
          { list: [1, 2], n: 1 },
          { list: [1, 2], n: 0 },
        ),
      ).toEqual({ list: [1, 2], n: 1 });
    });

    it("keeps both copies of the same insert when the arrays differ otherwise", () => {
      expect(merge([1], [1, 2, "L"], [1, 2])).toEqual([1, 2, 2, "L"]);
    });

    it("returns the local value when both sides made the same change", () => {
      const local = { a: 1 };

      expect(merge({ a: 0 }, local, { a: 1 })).toBe(local);
    });
  });

  it("returns undefined for a value the merge leaves absent", () => {
    expect(merge({ a: 1 }, undefined, { a: 2 })).toBeUndefined();
    expect(merge({ a: 1 }, { a: 2 }, undefined)).toBeUndefined();
    expect(merge(1, 2, undefined)).toBe(2);
  });
});
