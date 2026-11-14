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

  describe("matching records by a unique value", () => {
    const row = (id: string, cells: Record<string, number> = {}) => ({
      id,
      cells,
    });

    it("matches a record changed on both sides by its id after an insert", () => {
      expect(
        merge(
          [row("r1")],
          [row("r1", { a: 2 })],
          [row("r0"), row("r1", { b: 1 })],
        ),
      ).toEqual([row("r0"), row("r1", { b: 1, a: 2 })]);
      expect(
        merge(
          [row("r1")],
          [row("r0"), row("r1", { a: 2 })],
          [row("r1", { b: 1 })],
        ),
      ).toEqual([row("r0"), row("r1", { a: 2, b: 1 })]);
    });

    it("matches a record changed on both sides by its id after a delete", () => {
      expect(
        merge(
          [row("r0"), row("r1")],
          [row("r0"), row("r1", { a: 2 })],
          [row("r1", { b: 1 })],
        ),
      ).toEqual([row("r1", { b: 1, a: 2 })]);
      expect(
        merge(
          [row("r0"), row("r1")],
          [row("r1", { a: 2 })],
          [row("r0"), row("r1", { b: 1 })],
        ),
      ).toEqual([row("r1", { a: 2, b: 1 })]);
    });

    it("matches a record by its id where the other side also changed its done flag", () => {
      const todo = (id: string, done: boolean, cells = {}) => ({
        id,
        done,
        cells,
      });

      // The remote side inserted r0, and changed r1's flag and cells and r2's cells. Two records
      // of each array hold `done: false`, so only the ids pair them.
      expect(
        merge(
          [todo("r1", false), todo("r2", false)],
          [todo("r1", false, { a: 2 }), todo("r2", false)],
          [
            todo("r0", false),
            todo("r1", true, { b: 1 }),
            todo("r2", false, { b: 2 }),
          ],
        ),
      ).toEqual([
        todo("r0", false),
        todo("r1", true, { b: 1, a: 2 }),
        todo("r2", false, { b: 2 }),
      ]);
    });

    it("pairs no records by a value several records of one array share", () => {
      // `done: true` is on one base record, but on every remote one, so it pairs none, and the
      // records pair by position: the local edit to the second lands on the second.
      expect(
        merge(
          [
            { k: "x", done: false },
            { k: "y", done: true },
          ],
          [
            { k: "x", done: false },
            { k: "y", done: true, a: 2 },
          ],
          [
            { k: "z", done: true },
            { k: "w", done: true },
            { k: "v", done: true },
          ],
        ),
      ).toEqual([
        { k: "z", done: true },
        { k: "w", done: true, a: 2 },
        { k: "v", done: true },
      ]);
    });

    it("falls back to position where ids are duplicated", () => {
      // r1 is twice on each side, so its id pairs nothing, and the local edit to the first r1
      // lands on r0, the remote side's first record.
      expect(
        merge(
          [row("r1"), row("r1")],
          [row("r1", { a: 2 }), row("r1")],
          [row("r0"), row("r1", { b: 1 }), row("r1", { b: 1 })],
        ),
      ).toEqual([
        row("r0", { a: 2 }),
        row("r1", { b: 1 }),
        row("r1", { b: 1 }),
      ]);
    });

    it("falls back to position where the other side changed the id", () => {
      expect(
        merge(
          [row("r1")],
          [row("r1", { a: 2 })],
          [row("r0"), row("r1b", { b: 1 })],
        ),
      ).toEqual([row("r0", { a: 2 }), row("r1b", { b: 1 })]);
    });

    it("does not pair by a value unique within a run but repeated elsewhere in the array", () => {
      const todo = (id: string, done: boolean, cells = {}) => ({
        id,
        done,
        cells,
      });

      // r9 is equal on both sides, so the run is r1 against r0 and r1. Within it, `done: false`
      // is unique on each side, but r9 holds it too, so only the id pairs r1 with itself.
      expect(
        merge(
          [todo("r1", false), todo("r9", false)],
          [todo("r1", false, { a: 2 }), todo("r9", false)],
          [todo("r0", false), todo("r1", true, { b: 1 }), todo("r9", false)],
        ),
      ).toEqual([
        todo("r0", false),
        todo("r1", true, { b: 1, a: 2 }),
        todo("r9", false),
      ]);
    });

    it("falls back to position where two unique values point to different records", () => {
      const todo = (id: string, done: boolean, cells = {}) => ({
        id,
        done,
        cells,
      });

      // r1's `done: false` is unique in each array, but held by r0 on the remote side, while
      // its id points to r1: r1 pairs with r0, its neighbour, by position.
      expect(
        merge(
          [todo("r1", false)],
          [todo("r1", false, { a: 2 })],
          [todo("r0", false), todo("r1", true, { b: 1 })],
        ),
      ).toEqual([todo("r0", false, { a: 2 }), todo("r1", true, { b: 1 })]);
    });

    it("keeps the pairs in order, so a record moved past others is deleted and inserted", () => {
      // The remote side moved r3 to the front and changed every row. Pairing r3 too would cross
      // the other pairs, so only r1 and r2 pair by id; r3 is deleted and inserted, which drops
      // the local edit to it, as a CRDT drops an edit inside a deleted item.
      expect(
        merge(
          [row("r1"), row("r2"), row("r3")],
          [row("r1", { a: 1 }), row("r2", { a: 2 }), row("r3", { a: 3 })],
          [row("r3", { b: 3 }), row("r1", { b: 1 }), row("r2", { b: 2 })],
        ),
      ).toEqual([
        row("r3", { b: 3 }),
        row("r1", { b: 1, a: 1 }),
        row("r2", { b: 2, a: 2 }),
      ]);
    });

    it("pairs the records between two matched ones by position", () => {
      // r1 and r3 pair by id; between them, the base's x pairs with the remote side's y.
      expect(
        merge(
          [row("r1"), { v: "x" }, row("r3")],
          [row("r1"), { v: "x", a: 2 }, row("r3")],
          [row("r0"), row("r1", { b: 1 }), { v: "y" }, row("r3", { b: 3 })],
        ),
      ).toEqual([
        row("r0"),
        row("r1", { b: 1 }),
        { v: "y", a: 2 },
        row("r3", { b: 3 }),
      ]);
    });

    it("pairs a record changed in place by position, even where its id names a record elsewhere", () => {
      // The local side swaps the ids of x and y in place. Each change is a run of one record on
      // each side, and the ids point to the other run, so each record pairs with its neighbour
      // in place, by position.
      expect(
        merge(
          [row("k0"), row("x"), row("k1"), row("y"), row("k2")],
          [
            row("k0"),
            row("y", { a: 1 }),
            row("k1"),
            row("x", { a: 2 }),
            row("k2"),
          ],
          [
            row("k0"),
            row("x", { b: 1 }),
            row("k1"),
            row("y", { b: 2 }),
            row("k2"),
          ],
        ),
      ).toEqual([
        row("k0"),
        row("y", { a: 1, b: 1 }),
        row("k1"),
        row("x", { a: 2, b: 2 }),
        row("k2"),
      ]);
    });

    it("matches records by id on both sides, in several runs of one side", () => {
      // Each run deletes a record and changes the next: the local side does it twice, the
      // remote side once.
      const base = ["r0", "r1", "r2", "r3", "r4", "r5"].map((id) => row(id));
      expect(
        merge(
          base,
          [row("r1", { a: 1 }), row("r2"), row("r4", { a: 4 }), row("r5")],
          [row("r0"), row("r1"), row("r2"), row("r3"), row("r5", { b: 5 })],
        ),
      ).toEqual([row("r1", { a: 1 }), row("r2"), row("r5", { b: 5 })]);
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

    // The merge tells whether the remote value equals the base or the local one from merging
    // their contents, so these check it a few levels down, with the remote value a JSON copy.
    const doc = {
      title: "Doc",
      sections: [
        { id: "s1", paragraphs: [{ id: "p1", spans: [{ text: "a" }] }] },
        { id: "s2", paragraphs: [{ id: "p2", spans: [{ text: "b" }] }] },
      ],
    };
    /** `doc` with the span of section `section` holding `text`, sharing the rest. */
    const editSpan = (section: number, text: string): typeof doc => ({
      ...doc,
      sections: doc.sections.map((each, index) =>
        index === section
          ? {
              ...each,
              paragraphs: [{ ...each.paragraphs[0], spans: [{ text }] }],
            }
          : each,
      ),
    });
    const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    it("returns the local value where the remote one equals the base, at any depth", () => {
      const local = editSpan(1, "B");

      expect(merge(doc, local, copy(doc))).toBe(local);
    });

    it("returns the local value where the remote one holds the same changes, at any depth", () => {
      const local = editSpan(1, "B");

      expect(merge(doc, local, copy(local))).toBe(local);
      expect(merge(doc.sections, local.sections, copy(local.sections))).toBe(
        local.sections,
      );
    });

    it("keeps by identity each list item only one side changed", () => {
      const local = editSpan(0, "A");
      const remote = copy(editSpan(1, "B"));
      const merged = merge(doc, local, remote) as typeof doc;

      expect(merged.sections[0]).toBe(local.sections[0]);
      expect(merged.sections[1]).toBe(remote.sections[1]);
    });
  });

  it("returns undefined for a value the merge leaves absent", () => {
    expect(merge({ a: 1 }, undefined, { a: 2 })).toBeUndefined();
    expect(merge({ a: 1 }, { a: 2 }, undefined)).toBeUndefined();
    expect(merge(1, 2, undefined)).toBe(2);
  });
});
