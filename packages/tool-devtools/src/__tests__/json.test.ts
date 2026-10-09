import { describe, expect, it } from "vitest";
import {
  diffJson,
  findNonJson,
  formatPath,
  setIn,
  share,
  toJsonObject,
} from "../json";

describe("toJsonObject", () => {
  it("drops functions and undefined, as JSON does", () => {
    expect(
      toJsonObject({ count: 1, missing: undefined, increment: () => {} }),
    ).toEqual({ count: 1 });
  });

  it("returns an empty object for a non-object state", () => {
    expect(toJsonObject(null)).toEqual({});
    expect(toJsonObject([1, 2])).toEqual({});
  });
});

describe("findNonJson", () => {
  it("finds class instances, BigInts, symbols and non-finite numbers by path", () => {
    class Point {
      x = 1;
    }
    const at = new Date(0);
    expect(
      findNonJson({
        todos: [{ title: "a", at }],
        tags: new Set(["x"]),
        point: new Point(),
        big: 1n,
        id: Symbol("id"),
        ratio: NaN,
        limit: -Infinity,
      }),
    ).toEqual([
      { path: ["todos", 0, "at"], kind: "Date" },
      { path: ["tags"], kind: "Set" },
      { path: ["point"], kind: "Point" },
      { path: ["big"], kind: "BigInt" },
      { path: ["id"], kind: "Symbol" },
      { path: ["ratio"], kind: "NaN" },
      { path: ["limit"], kind: "-Infinity" },
    ]);
  });

  it("accepts plain JSON, functions, undefined and null-prototype objects", () => {
    const bare = Object.assign(Object.create(null) as object, { a: 1 });
    expect(
      findNonJson({
        list: [1, "a", null, true, { nested: [] }],
        bare,
        add: () => {},
        missing: undefined,
      }),
    ).toEqual([]);
  });

  it("reports a circular reference but not a shared one", () => {
    const shared = { a: 1 };
    const node: Record<string, unknown> = { shared, again: shared };
    node.self = node;
    expect(findNonJson(node)).toEqual([
      { path: ["self"], kind: "circular reference" },
    ]);
  });
});

describe("setIn", () => {
  it("copies only along the path", () => {
    const root = { a: { b: 1 }, c: { d: 2 } };
    const next = setIn(root, ["a", "b"], 3) as typeof root;
    expect(next).toEqual({ a: { b: 3 }, c: { d: 2 } });
    expect(next.c).toBe(root.c);
    expect(root.a.b).toBe(1);
  });

  it("removes an object key or an array item for undefined", () => {
    expect(setIn({ a: 1, b: 2 }, ["a"], undefined)).toEqual({ b: 2 });
    expect(setIn({ list: [1, 2, 3] }, ["list", 1], undefined)).toEqual({
      list: [1, 3],
    });
  });

  it("works on frozen state", () => {
    const root = Object.freeze({ list: Object.freeze([1, 2]) });
    expect(setIn(root, ["list", 0], 5)).toEqual({ list: [5, 2] });
  });
});

describe("share", () => {
  it("reuses unchanged subtrees", () => {
    const current = { todos: [{ id: "1" }, { id: "2" }], filter: "all" };
    const next = share(current, {
      todos: [{ id: "1" }, { id: "3" }],
      filter: "all",
    }) as typeof current;
    expect(next.todos[0]).toBe(current.todos[0]);
    expect(next.todos[1]).toEqual({ id: "3" });
    expect(share(current, structuredClone(current))).toBe(current);
  });
});

describe("formatPath", () => {
  it("reads like code", () => {
    expect(formatPath(["todos", 0, "title"])).toBe("todos[0].title");
    expect(formatPath(["a-b", "c"])).toBe('["a-b"].c');
    expect(formatPath([])).toBe("");
  });
});

describe("diffJson", () => {
  it("lists object inserts, updates and deletes with before and after", () => {
    expect(diffJson({ a: 1, b: 2 }, { a: 5, c: 3 })).toEqual([
      { kind: "delete", path: ["b"], before: 2 },
      { kind: "update", path: ["a"], before: 1, after: 5 },
      { kind: "insert", path: ["c"], after: 3 },
    ]);
  });

  it("follows nested changes into arrays", () => {
    const before = {
      todos: [
        { title: "a", done: false },
        { title: "b", done: false },
      ],
    };
    const after = { todos: [{ title: "a", done: true }] };
    expect(diffJson(before, after)).toEqual([
      {
        kind: "update",
        path: ["todos", 0, "done"],
        before: false,
        after: true,
      },
      {
        kind: "delete",
        path: ["todos", 1],
        before: { title: "b", done: false },
      },
    ]);
  });

  it("shows a string edit as one update of the whole string", () => {
    expect(diffJson({ text: "hello" }, { text: "help" })).toEqual([
      { kind: "update", path: ["text"], before: "hello", after: "help" },
    ]);
  });
});
