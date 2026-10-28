import { describe, expect, it, vi } from "vitest";
import {
  ChangeType,
  getChanges,
  type ListChange,
  type Diffable,
  type JsonObject,
  type TextPolicy,
  toJsonValue,
} from "../index.js";
import { patchState } from "../patching.js";
import { nonJsonWrites, prototypeMemberKeys, todoTitles } from "./helpers.js";

const { INSERT, UPDATE, DELETE, PENDING } = ChangeType;

const item = (id: string, done = false) => ({ id, done });

const appliesCleanly = (a: Diffable, b: Diffable): void => {
  expect(patchState(a, b)).toEqual(b);
};

const applySequentially = (
  array: unknown[],
  changes: ListChange[],
): unknown[] => {
  const revised = [...array];
  for (const change of changes) {
    if (change.type === INSERT) revised.splice(change.key, 0, change.value);
    else if (change.type === UPDATE) revised[change.key] = change.value;
    else if (change.type === DELETE)
      revised.splice(change.key, change.count ?? 1);
  }
  return revised;
};

let seed = 42;
const random = (): number =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const randomArray = (): unknown[] =>
  Array.from({ length: Math.floor(random() * 6) }, () =>
    Math.floor(random() * 4),
  );
const randomPairs = Array.from(
  { length: 2000 },
  () => [randomArray(), randomArray()] as const,
);

describe("getChanges", () => {
  it("throws a TypeError naming both kinds when the root values are of different kinds", () => {
    const diffAny = getChanges as (a: unknown, b: unknown) => unknown;
    const message = (kinds: string) =>
      new TypeError(
        `getChanges needs two strings, two arrays or two records, got ${kinds}`,
      );

    expect(() => diffAny("abc", ["a", "b", "c"])).toThrow(
      message("string and array"),
    );
    expect(() => diffAny([1], { 0: 1 })).toThrow(message("array and object"));
    expect(() => diffAny({ a: 1 }, "a")).toThrow(message("object and string"));
    expect(() => diffAny(null, 1)).toThrow(message("null and number"));
  });

  it("finds no change in a NaN that stays NaN", () => {
    expect(getChanges({ a: NaN, l: [NaN] }, { a: NaN, l: [NaN] })).toEqual([]);
  });

  describe("strings", () => {
    it("returns no changes for equal strings", () => {
      expect(getChanges("same", "same")).toEqual([]);
      expect(getChanges("", "")).toEqual([]);
    });

    it("inserts the whole string at once when the old string is empty", () => {
      expect(getChanges("", "ab")).toEqual([
        { type: INSERT, key: 0, value: "ab" },
      ]);
    });

    it("deletes every character at index 0 in one step when the new string is empty", () => {
      expect(getChanges("ab", "")).toEqual([
        { type: DELETE, key: 0, count: 2 },
      ]);
    });

    it("replaces everything when no character is shared", () => {
      expect(getChanges("ab", "cd")).toEqual([
        { type: DELETE, key: 0, count: 2 },
        { type: INSERT, key: 0, value: "cd" },
      ]);
    });

    it("appends a run of characters as one insert", () => {
      expect(getChanges("Todo 1", "Todo 1 A")).toEqual([
        { type: INSERT, key: 6, value: " A" },
      ]);
    });

    it("prepends a run of characters as one insert", () => {
      expect(getChanges("Todo 1", "B Todo 1")).toEqual([
        { type: INSERT, key: 0, value: "B " },
      ]);
    });

    it("addresses an edit in a long string by its offset", () => {
      const text = "lorem ipsum ".repeat(500);
      const middle = text.length / 2;
      const typed = `${text.slice(0, middle)}X${text.slice(middle)}`;
      const deleted = text.slice(0, middle) + text.slice(middle + 1);

      expect(getChanges(text, typed)).toEqual([
        { type: INSERT, key: middle, value: "X" },
      ]);
      expect(getChanges(text, deleted)).toEqual([
        { type: DELETE, key: middle, count: 1 },
      ]);
    });

    it("replaces a changed middle that shares no character at its offset", () => {
      expect(getChanges("abcd", "abXd")).toEqual([
        { type: DELETE, key: 2, count: 1 },
        { type: INSERT, key: 2, value: "X" },
      ]);
    });

    it("emits deletions at their position in the progressively edited string", () => {
      expect(getChanges("abc", "ac")).toEqual([
        { type: DELETE, key: 1, count: 1 },
      ]);
      expect(getChanges("abcd", "ad")).toEqual([
        { type: DELETE, key: 1, count: 2 },
      ]);
    });

    it("deletes adjacent characters, surrogate pairs included, in one step", () => {
      // "b" is shared, so this takes the edit-script path rather than the fast one.
      expect(getChanges("a😀bc😃", "ab")).toEqual([
        { type: DELETE, key: 1, count: 2 },
        { type: DELETE, key: 2, count: 3 },
      ]);
    });

    it.each([
      ["hello", "help"],
      ["kitten", "sitting"],
      ["abc", "abcabc"],
      ["abcabc", "abc"],
      ["aaa", "a"],
      ["a", "aaa"],
      ["x", "y"],
      ["search", "sea"],
      ["sea", "search"],
      ["abcdef", "fedcba"],
      ["Todo 1", "B Todo 1 A"],
      ["the quick brown fox", "the slow brown cat"],
      ["aXbXc", "abc"],
      ["abc", "aXbXc"],
    ])("transforms %j into %j when applied", appliesCleanly);
  });

  describe("arrays", () => {
    it("returns no changes for equal arrays", () => {
      expect(getChanges([], [])).toEqual([]);
      expect(getChanges([1, "a", null], [1, "a", null])).toEqual([]);
      expect(getChanges([item("1"), [1, 2]], [item("1"), [1, 2]])).toEqual([]);
    });

    it("inserts appended items after the last index", () => {
      expect(getChanges([1, 2], [1, 2, 3])).toEqual([
        { type: INSERT, key: 2, value: 3 },
      ]);
      expect(getChanges([1], [1, 2, 3])).toEqual([
        { type: INSERT, key: 1, value: 2 },
        { type: INSERT, key: 2, value: 3 },
      ]);
      expect(getChanges([item("1")], [item("1"), item("2")])).toEqual([
        { type: INSERT, key: 1, value: item("2") },
      ]);
    });

    it("inserts everything when the old array is empty", () => {
      expect(getChanges([], [1, 2])).toEqual([
        { type: INSERT, key: 0, value: 1 },
        { type: INSERT, key: 1, value: 2 },
      ]);
    });

    it("deletes every item when the new array is empty", () => {
      expect(getChanges([1, 2], [])).toEqual([
        { type: DELETE, key: 0, count: 2 },
      ]);
    });

    it("deletes a run of items in one step at its first index", () => {
      expect(getChanges([1, 2, 3], [1, 2])).toEqual([
        { type: DELETE, key: 2, count: 1 },
      ]);
      expect(getChanges([1, 2, 3, 4], [1])).toEqual([
        { type: DELETE, key: 1, count: 3 },
      ]);
    });

    it("inserts a primitive or an object in the middle", () => {
      expect(getChanges([1, 3], [1, 2, 3])).toEqual([
        { type: INSERT, key: 1, value: 2 },
      ]);
      expect(
        getChanges([item("1"), item("3")], [item("1"), item("2"), item("3")]),
      ).toEqual([{ type: INSERT, key: 1, value: item("2") }]);
    });

    it("inserts a primitive or an object at the start", () => {
      expect(getChanges([2, 3], [1, 2, 3])).toEqual([
        { type: INSERT, key: 0, value: 1 },
      ]);
      expect(getChanges([item("1")], [item("0"), item("1")])).toEqual([
        { type: INSERT, key: 0, value: item("0") },
      ]);
    });

    it("removes a middle item with a single delete", () => {
      expect(
        getChanges([item("1"), item("2"), item("3")], [item("1"), item("3")]),
      ).toEqual([{ type: DELETE, key: 1, count: 1 }]);

      const many = Array.from({ length: 50 }, (_, i) => item(String(i + 1)));
      expect(
        getChanges(
          many,
          many.filter((t) => t.id !== "25"),
        ),
      ).toEqual([{ type: DELETE, key: 24, count: 1 }]);
    });

    it("updates changed primitives in place", () => {
      expect(getChanges([1, 2, 3], [1, 9, 3])).toEqual([
        { type: UPDATE, key: 1, value: 9 },
      ]);
      expect(getChanges(["a", 1, null, true], ["a", 2, null, false])).toEqual([
        { type: UPDATE, key: 1, value: 2 },
        { type: UPDATE, key: 3, value: false },
      ]);
    });

    it("recurses into changed items", () => {
      expect(
        getChanges([item("1"), item("2")], [item("1"), item("2", true)]),
      ).toEqual([
        {
          type: PENDING,
          key: 1,
          kind: "record",
          changes: [{ type: UPDATE, key: "done", value: true }],
        },
      ]);
      expect(getChanges([[1], [2]], [[1], [2, 3]])).toEqual([
        {
          type: PENDING,
          key: 1,
          kind: "list",
          changes: [{ type: INSERT, key: 1, value: 3 }],
        },
      ]);
      expect(getChanges(["ab"], ["abc"])).toEqual([
        {
          type: PENDING,
          key: 0,
          kind: "text",
          changes: [{ type: INSERT, key: 2, value: "c" }],
        },
      ]);
    });

    it("updates an item whose kind changed", () => {
      expect(getChanges([[1]], [{ a: 1 }])).toEqual([
        { type: UPDATE, key: 0, value: { a: 1 } },
      ]);
      expect(getChanges(["a"], [["a"]])).toEqual([
        { type: UPDATE, key: 0, value: ["a"] },
      ]);
      expect(getChanges([{ a: 1 }], [1])).toEqual([
        { type: UPDATE, key: 0, value: 1 },
      ]);
      expect(getChanges([1], [{ a: 1 }])).toEqual([
        { type: UPDATE, key: 0, value: { a: 1 } },
      ]);
    });

    it("addresses later items by their shifted position after an insert", () => {
      expect(
        getChanges(
          [item("1"), item("2")],
          [item("0"), item("1"), item("2", true)],
        ),
      ).toEqual([
        { type: INSERT, key: 0, value: item("0") },
        {
          type: PENDING,
          key: 2,
          kind: "record",
          changes: [{ type: UPDATE, key: "done", value: true }],
        },
      ]);
      expect(getChanges([2, 3], [1, 2, 3, 4])).toEqual([
        { type: INSERT, key: 0, value: 1 },
        { type: INSERT, key: 3, value: 4 },
      ]);
      expect(getChanges([1, 2, 3], [0, 1])).toEqual([
        { type: INSERT, key: 0, value: 0 },
        { type: DELETE, key: 2, count: 2 },
      ]);
    });

    it("emits indices a sequential applier can use without sorting or clamping", () => {
      for (const [a, b] of randomPairs) {
        const changes = getChanges(a, b);
        const indices = changes.map(({ key }) => key);

        expect(indices).toEqual([...indices].sort((x, y) => x - y));
        // A run of deletions at one index is one step.
        changes.forEach((change, i) => {
          const next = changes[i + 1];
          if (change.type === DELETE && next?.type === DELETE)
            expect(next.key).not.toBe(change.key);
        });
        expect(applySequentially(a, changes)).toEqual(b);
        appliesCleanly(a, b);
      }
    });

    it.each([
      [
        [item("1"), item("2")],
        [item("0"), item("1"), item("2", true)],
      ],
      [
        [item("1"), item("2"), item("3")],
        [item("3"), item("1")],
      ],
      [
        [[1, 2], [3]],
        [[1], [3, 4]],
      ],
      [
        ["ab", "cd"],
        ["abc", "d", "e"],
      ],
      [
        [{ a: 1 }, 2],
        [1, { a: 2 }],
      ],
    ])("transforms %j into %j when applied", appliesCleanly);

    // `[1, , 3]`, built without a sparse literal.
    const holey = (): unknown[] => Object.assign([], { 0: 1, 2: 3 });

    it.each<[string, unknown[], unknown[]]>([
      ["an array item", [holey()], [[1, 2, 3]]],
      ["a record item's array", [{ cells: holey() }], [{ cells: [1, 2, 3] }]],
      ["an array item of a shorter new array", [[1, 2, 3], 4], [holey()]],
    ])("tells a hole from a value in %s", (_, before, after) =>
      appliesCleanly(before, after),
    );
  });

  describe("records", () => {
    it("returns no changes for equal records", () => {
      expect(getChanges({}, {})).toEqual([]);
      expect(
        getChanges(
          { a: 1, s: "x", o: { l: [1] } },
          { a: 1, s: "x", o: { l: [1] } },
        ),
      ).toEqual([]);
    });

    it("inserts added keys", () => {
      expect(getChanges({ a: 1 }, { a: 1, b: 2 })).toEqual([
        { type: INSERT, key: "b", value: 2 },
      ]);
      expect(getChanges({}, { o: { x: 1 } })).toEqual([
        { type: INSERT, key: "o", value: { x: 1 } },
      ]);
    });

    it("deletes removed keys, functions included", () => {
      expect(getChanges({ a: 1, b: 2 }, { a: 1 })).toEqual([
        { type: DELETE, key: "b" },
      ]);
      expect(getChanges({ a: 1, fn: () => {} }, { a: 1 })).toEqual([
        { type: DELETE, key: "fn" },
      ]);
    });

    it("updates changed primitives", () => {
      expect(getChanges({ a: 1 }, { a: 2 })).toEqual([
        { type: UPDATE, key: "a", value: 2 },
      ]);
      expect(getChanges({ a: true }, { a: false })).toEqual([
        { type: UPDATE, key: "a", value: false },
      ]);
    });

    it("updates values changing to or from null", () => {
      expect(getChanges({ a: null }, { a: { b: 1 } })).toEqual([
        { type: UPDATE, key: "a", value: { b: 1 } },
      ]);
      expect(getChanges({ a: { b: 1 } }, { a: null })).toEqual([
        { type: UPDATE, key: "a", value: null },
      ]);
      expect(getChanges({ a: "x" }, { a: null })).toEqual([
        { type: UPDATE, key: "a", value: null },
      ]);
      expect(getChanges({ a: null }, { a: null })).toEqual([]);
    });

    it("recurses into nested objects, arrays, and strings", () => {
      expect(getChanges({ o: { x: 1 } }, { o: { x: 2 } })).toEqual([
        {
          type: PENDING,
          key: "o",
          kind: "record",
          changes: [{ type: UPDATE, key: "x", value: 2 }],
        },
      ]);
      expect(getChanges({ l: [1] }, { l: [1, 2] })).toEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [{ type: INSERT, key: 1, value: 2 }],
        },
      ]);
      expect(getChanges({ t: "ab" }, { t: "abc" })).toEqual([
        {
          type: PENDING,
          key: "t",
          kind: "text",
          changes: [{ type: INSERT, key: 2, value: "c" }],
        },
      ]);
      expect(
        getChanges({ o: { l: [{ x: 1 }] } }, { o: { l: [{ x: 2 }] } }),
      ).toEqual([
        {
          type: PENDING,
          key: "o",
          kind: "record",
          changes: [
            {
              type: PENDING,
              key: "l",
              kind: "list",
              changes: [
                {
                  type: PENDING,
                  key: 0,
                  kind: "record",
                  changes: [{ type: UPDATE, key: "x", value: 2 }],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("updates a value whose kind changed", () => {
      expect(getChanges({ v: { a: 1 } }, { v: [1] })).toEqual([
        { type: UPDATE, key: "v", value: [1] },
      ]);
      expect(getChanges({ v: "a" }, { v: {} })).toEqual([
        { type: UPDATE, key: "v", value: {} },
      ]);
      expect(getChanges({ v: [1] }, { v: "1" })).toEqual([
        { type: UPDATE, key: "v", value: "1" },
      ]);
      expect(getChanges({ v: "a" }, { v: 1 })).toEqual([
        { type: UPDATE, key: "v", value: 1 },
      ]);
    });

    it("lists deletions before insertions and updates", () => {
      expect(getChanges({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual([
        { type: DELETE, key: "a" },
        { type: UPDATE, key: "b", value: 3 },
        { type: INSERT, key: "c", value: 4 },
      ]);
    });

    it.each(prototypeMemberKeys)(
      "inserts and deletes a key named %s",
      (key) => {
        expect(getChanges({ [key]: 1 }, {})).toEqual([{ type: DELETE, key }]);
        expect(getChanges({}, { [key]: "x" })).toEqual([
          { type: INSERT, key, value: "x" },
        ]);
        expect(getChanges({ o: { [key]: 1 } }, { o: {} })).toEqual([
          {
            type: PENDING,
            key: "o",
            kind: "record",
            changes: [{ type: DELETE, key }],
          },
        ]);
      },
    );

    it("never diffs a __proto__ key", () => {
      const withProto = (json: string): Record<string, unknown> =>
        JSON.parse(json);

      expect(
        getChanges({ a: 1 }, withProto('{"a":1,"__proto__":{"isAdmin":true}}')),
      ).toEqual([]);
      expect(
        getChanges(withProto('{"__proto__":{"isAdmin":true}}'), {}),
      ).toEqual([]);
      expect(
        getChanges(
          { l: [{ id: "1" }] },
          withProto('{"l":[{"id":"1","__proto__":{"isAdmin":true}}]}'),
        ),
      ).toEqual([]);
    });

    it.each([
      [
        { a: 1, b: 2 },
        { b: 3, c: 4 },
      ],
      [
        { todos: [item("1")], term: "" },
        { todos: [item("0"), item("1", true)], term: "ab" },
      ],
      [{ v: { a: 1 } }, { v: [1] }],
      [
        { v: [1], s: "a" },
        { v: null, s: 1 },
      ],
      [{ deep: { l: ["a", "b"] } }, { deep: { l: ["b"] } }],
      [{}, { a: { b: { c: [1, "x"] } } }],
      [{ a: { b: { c: [1, "x"] } } }, {}],
    ])("transforms %j into %j when applied", appliesCleanly);
  });

  describe("with a text policy", () => {
    const text = todoTitles;

    it.each([false, true])(
      "skips the text policy inside an unchanged record with json: %s",
      (json) => {
        const unchanged = { title: "Keep this title" };
        const text: TextPolicy = (path) => {
          expect(path).toEqual(["title"]);
          return true;
        };

        expect(
          getChanges(
            { unchanged, title: "a" },
            { unchanged, title: "ab" },
            { json, text },
          ),
        ).toEqual([
          {
            type: PENDING,
            key: "title",
            kind: "text",
            changes: [{ type: INSERT, key: 1, value: "b" }],
          },
        ]);
      },
    );

    it("replaces a changed string outside the policy whole", () => {
      expect(
        getChanges(
          { filterStatus: "all" },
          { filterStatus: "active" },
          { text },
        ),
      ).toEqual([{ type: UPDATE, key: "filterStatus", value: "active" }]);
      expect(getChanges({ tags: ["ab"] }, { tags: ["abc"] }, { text })).toEqual(
        [
          {
            type: PENDING,
            key: "tags",
            kind: "list",
            changes: [{ type: UPDATE, key: 0, value: "abc" }],
          },
        ],
      );
      expect(getChanges({ id: "1" }, { id: "1" }, { text })).toEqual([]);
    });

    it("diffs a string the policy marks as text character by character", () => {
      expect(
        getChanges(
          { todos: [{ id: "1", title: "ab" }] },
          { todos: [{ id: "2", title: "abc" }] },
          { text },
        ),
      ).toEqual([
        {
          type: PENDING,
          key: "todos",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: 0,
              kind: "record",
              changes: [
                { type: UPDATE, key: "id", value: "2" },
                {
                  type: PENDING,
                  key: "title",
                  kind: "text",
                  changes: [{ type: INSERT, key: 2, value: "c" }],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("asks with the path from the root, array indices as numbers", () => {
      const policy = vi.fn<TextPolicy>(() => true);
      getChanges(
        { todos: [{ title: "a" }, { title: "b" }], term: "x" },
        { todos: [{ title: "a" }, { title: "c" }], term: "y" },
        { text: policy },
      );
      expect(policy.mock.calls).toEqual([[["todos", 1, "title"]], [["term"]]]);
    });

    it("always diffs two strings passed directly character by character", () => {
      expect(getChanges("ab", "abc", { text: () => false })).toEqual([
        { type: INSERT, key: 2, value: "c" },
      ]);
    });
  });

  describe("with json", () => {
    const json = { json: true };

    it.each(nonJsonWrites)(
      "finds the changes toJsonValue would for %s, and none once they are applied",
      (_, before, next, expected) => {
        expect(getChanges(before, next, json)).toStrictEqual(
          getChanges(before, toJsonValue(next) as JsonObject),
        );
        expect(getChanges(expected, next, json)).toEqual([]);
      },
    );

    it("carries values as JSON would store them", () => {
      expect(
        getChanges(
          { a: 1 },
          { a: 2, o: { b: undefined, l: [() => 1, 1] } },
          json,
        ),
      ).toStrictEqual([
        { type: UPDATE, key: "a", value: 2 },
        { type: INSERT, key: "o", value: { l: [null, 1] } },
      ]);
      expect(
        getChanges({ l: [1] }, { l: [{ x: undefined, y: 1 }] }, json),
      ).toStrictEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [{ type: UPDATE, key: 0, value: { y: 1 } }],
        },
      ]);
    });

    it("matches containers inside arrays as JSON would store them", () => {
      const cases: [unknown, unknown][] = [
        [{ a: 1, b: undefined }, { a: 1 }],
        [{ a: 1 }, { a: 1, f: () => 1 }],
        [{ a: 1 }, JSON.parse('{"a":1,"__proto__":{"isAdmin":true}}')],
        [
          [1, null],
          [1, undefined],
        ],
      ];

      // The item before it is new, so only a match keeps the item from being rewritten.
      for (const [before, after] of cases)
        expect(getChanges({ l: [before] }, { l: [0, after] }, json)).toEqual([
          {
            type: PENDING,
            key: "l",
            kind: "list",
            changes: [{ type: INSERT, key: 0, value: 0 }],
          },
        ]);
    });

    it("finds the changes inside containers that differ as JSON", () => {
      expect(
        getChanges({ l: [{ a: 1, c: 2 }] }, { l: [{ a: 1 }] }, json),
      ).toEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: 0,
              kind: "record",
              changes: [{ type: DELETE, key: "c" }],
            },
          ],
        },
      ]);
      expect(getChanges({ l: [{ a: 1 }] }, { l: [{ a: 2 }] }, json)).toEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: 0,
              kind: "record",
              changes: [{ type: UPDATE, key: "a", value: 2 }],
            },
          ],
        },
      ]);
      expect(getChanges({ l: [[1, 2]] }, { l: [[1]] }, json)).toEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: 0,
              kind: "list",
              changes: [{ type: DELETE, key: 1, count: 1 }],
            },
          ],
        },
      ]);
      expect(getChanges({ l: [[1, 2]] }, { l: [[1, 3]] }, json)).toEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: 0,
              kind: "list",
              changes: [{ type: UPDATE, key: 1, value: 3 }],
            },
          ],
        },
      ]);
    });

    it("carries a value that is already JSON as it is", () => {
      const kept = { x: [1] };
      const [change] = getChanges({}, { kept }, json);
      expect(change.type).toBe(INSERT);
      expect(change.type === INSERT && change.value).toBe(kept);
    });

    it("tells an entry holding undefined from one holding null", () => {
      expect(getChanges({ a: null }, { a: undefined }, json)).toEqual([
        { type: DELETE, key: "a" },
      ]);
      expect(
        getChanges({ l: [{ a: null }] }, { l: [{ a: undefined }] }, json),
      ).toEqual([
        {
          type: PENDING,
          key: "l",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: 0,
              kind: "record",
              changes: [{ type: DELETE, key: "a" }],
            },
          ],
        },
      ]);
    });

    it("matches items as JSON whichever array is longer", () => {
      expect(
        getChanges({ l: [null, 1, 2] }, { l: [undefined, 1] }, json),
      ).toEqual(getChanges({ l: [null, 1, 2] }, { l: [null, 1] }));
      expect(
        getChanges({ l: [null] }, { l: [undefined, () => 1] }, json),
      ).toEqual(getChanges({ l: [null] }, { l: [null, null] }));
    });

    it("is off by default", () => {
      expect(getChanges({}, { a: undefined })).toEqual([
        { type: INSERT, key: "a", value: undefined },
      ]);
    });
  });

  describe("known limitations", () => {
    it("does not look inside Date, Map, or Set values, so state must be plain JSON", () => {
      expect(getChanges({ d: new Date(1) }, { d: new Date(2) })).toEqual([]);
      expect(
        getChanges({ m: new Map([[1, 1]]) }, { m: new Map([[1, 2]]) }),
      ).toEqual([]);
      expect(getChanges({ s: new Set([1]) }, { s: new Set([2]) })).toEqual([]);
    });
  });
});
