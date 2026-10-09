import { describe, expect, it } from "vitest";
import { applyChanges, applyStringChanges, type ApplyOps } from "../apply.js";
import { ChangeType } from "../change.js";
import { getChanges } from "../diff.js";
import { snapshot } from "./helpers.js";

type Plain = Record<string, unknown>;

/** Text a test container holds, edited in place by `editText`; its JSON is the string. */
class Text {
  constructor(public value: string) {}
  toJSON(): string {
    return this.value;
  }
}

/** A value a test container holds whole, as a document holds a value other code stored. */
class Opaque {
  constructor(public json: object) {}
  toJSON(): object {
    return this.json;
  }
}

/** Ops over plain objects, arrays and `Text`s, with the log of what the walk asked for. */
const createOps = () => {
  const log: string[] = [];
  const at = (path: readonly (string | number)[], key?: string | number) =>
    [...path, ...(key === undefined ? [] : [key])].join(".") || "$";
  const ops: ApplyOps = {
    kind: (value) =>
      value instanceof Text
        ? "text"
        : Array.isArray(value)
          ? "list"
          : value !== null && Object.getPrototypeOf(value) === Object.prototype
            ? "record"
            : undefined,
    get: (container, key) => (container as Plain)[key],
    set: (container, key, value, path) => {
      log.push(`set ${at(path, key)}`);
      (container as Plain)[key] = value;
    },
    remove: (container, key, path) => {
      log.push(`remove ${at(path, key)}`);
      delete (container as Plain)[key];
    },
    splice: (list, index, deleteCount, inserted, path) => {
      log.push(`splice ${at(path)} ${index} ${deleteCount} ${inserted.length}`);
      (list as unknown[]).splice(index, deleteCount, ...inserted);
    },
    editText: (text, index, deleteCount, inserted, path) => {
      log.push(`editText ${at(path)} ${index} ${deleteCount} ${inserted}`);
      const { value } = text as Text;
      (text as Text).value =
        value.slice(0, index) + inserted + value.slice(index + deleteCount);
    },
  };
  return { ops, log };
};

/** Applies the changes from `before` to `after` onto a fresh copy of `before`. */
const reconcile = <T extends object>(before: T, after: T) => {
  const { ops, log } = createOps();
  const target = snapshot(before);
  applyChanges(target, before, after, ops);
  return { target, log };
};

describe("applyStringChanges", () => {
  it("revises a string by the edit script getChanges produced", () => {
    const cases: [string, string][] = [
      ["", "abc"],
      ["abc", ""],
      ["abc", "abcd"],
      ["abc", "xyz"],
      ["the quick fox", "the quick brown fox"],
      ["aaa", "aa"],
    ];

    for (const [before, after] of cases)
      expect(applyStringChanges(before, getChanges(before, after))).toBe(after);
  });

  it("ignores a step it has no meaning for", () => {
    expect(applyStringChanges("ab", [[ChangeType.UPDATE, 0, "z"]])).toBe("ab");
  });
});

describe("applyChanges", () => {
  it("adds, replaces and removes record keys", () => {
    const { target, log } = reconcile({ keep: 1, drop: 2, change: "a" }, {
      keep: 1,
      change: "b",
      added: true,
    } as Record<string, unknown>);

    expect(target).toEqual({ keep: 1, change: "b", added: true });
    expect(log).toEqual(["remove drop", "set change", "set added"]);
  });

  it("splices an array rather than rewriting it", () => {
    const before = { list: [{ id: "1" }, { id: "2" }, { id: "3" }] };
    const after = { list: [{ id: "2" }, { id: "3" }, { id: "4" }] };

    const { target, log } = reconcile(before, after);

    expect(target).toEqual(after);
    expect(log).toEqual(["splice list 0 1 0", "splice list 2 0 1"]);
  });

  it("recurses into a container instead of replacing it", () => {
    const before = {
      list: [
        { id: "1", done: false },
        { id: "2", done: false },
      ],
    };
    const after = {
      list: [
        { id: "1", done: true },
        { id: "2", done: false },
      ],
    };
    const target = snapshot(before);
    const untouched = target.list[1];
    const edited = target.list[0];
    const { ops, log } = createOps();

    applyChanges(target, before, after, ops);

    expect(target).toEqual(after);
    // Only the field the diff named was written; both elements are the objects that were there.
    expect(log).toEqual(["set list.0.done"]);
    expect(target.list[0]).toBe(edited);
    expect(target.list[1]).toBe(untouched);
  });

  it("replaces a string field whole when the target holds it as a plain value", () => {
    const { target, log } = reconcile({ title: "todo" }, { title: "todos" });

    expect(target).toEqual({ title: "todos" });
    expect(log).toEqual(["set title"]);
  });

  it("replaces a child the ops treat as a plain value with its next value", () => {
    // Its JSON is a record, but the target holds it whole, as a document holds a value other
    // code stored.
    const { ops, log } = createOps();
    const target = { list: [new Opaque({ a: 1 }), new Opaque({ a: 1 })] };
    const next = { list: [{ a: 2 }, { a: 1 }] };

    applyChanges(target, snapshot(target), next, ops);

    expect(target.list[0]).toEqual({ a: 2 });
    expect(target.list[1]).toBeInstanceOf(Opaque);
    expect(log).toEqual(["set list.0"]);
  });

  it("edits text in place, character by character, at its path", () => {
    const { ops, log } = createOps();
    const title = new Text("Plan the trip");
    const target = { todos: [{ title }] };

    applyChanges(
      target,
      snapshot(target),
      { todos: [{ title: "Plan a 😀 trip" }] },
      ops,
    );

    expect(target.todos[0].title).toBe(title);
    expect(title.value).toBe("Plan a 😀 trip");
    // The diff deletes "the" one character at a time, then inserts the new run.
    expect(log).toEqual([
      "editText todos.0.title 5 1 ",
      "editText todos.0.title 5 1 ",
      "editText todos.0.title 5 1 ",
      "editText todos.0.title 5 0 a 😀",
    ]);
  });

  it("replaces text whole when the ops cannot edit it", () => {
    const { ops, log } = createOps();
    delete ops.editText;
    const target = { title: new Text("Plan") };

    applyChanges(target, snapshot(target), { title: "Plan it" }, ops);

    expect(target).toEqual({ title: "Plan it" });
    expect(log).toEqual(["set title"]);
  });

  it("edits only the strings the text policy marks as text", () => {
    const { ops, log } = createOps();
    const target = { title: new Text("a"), id: new Text("x") };

    applyChanges(target, snapshot(target), { title: "ab", id: "y" }, ops, {
      text: (path) => path[0] === "title",
    });

    expect(target).toEqual({ title: new Text("ab"), id: "y" });
    expect(log).toEqual(["editText title 1 0 b", "set id"]);
  });

  it("writes every value as JSON would store it with options.json", () => {
    const { ops } = createOps();
    const target = { list: [1], kept: new Opaque({ a: 1 }) };

    applyChanges(
      target,
      snapshot(target),
      {
        list: [1, undefined],
        kept: { a: 2, fn: () => 1 },
        added: { b: undefined, c: 1 },
      },
      ops,
      { json: true },
    );

    expect(target).toStrictEqual({
      list: [1, null],
      kept: { a: 2 },
      added: { c: 1 },
    });
  });

  it("replaces an element whose kind changed", () => {
    const { target } = reconcile({ list: [{ a: 1 }, 2] }, {
      list: [7, { b: 8 }],
    } as unknown as {
      list: unknown[];
    });

    expect(target).toEqual({ list: [7, { b: 8 }] });
  });

  it("reaches the target state for every shape the diff can produce", () => {
    const cases: [object, object][] = [
      [{ a: 1 }, { a: 1 }],
      [{ list: [] }, { list: [1, 2, 3] }],
      [{ list: [1, 2, 3] }, { list: [] }],
      [{ list: [1, 2, 3] }, { list: [3, 2, 1] }],
      [{ list: ["a", "b"] }, { list: ["ab", "b"] }],
      [{ n: { deep: { deeper: [1] } } }, { n: { deep: { deeper: [1, 2] } } }],
      [{ a: { b: 1 } }, { a: [1] } as unknown as object],
      [{ a: null }, { a: { b: 1 } } as unknown as object],
      [
        { todos: [{ id: "1", title: "a", tags: ["x"] }], term: "ab" },
        {
          todos: [
            { id: "1", title: "ab" },
            { id: "2", title: "b", tags: [] },
          ],
          term: "abc",
        },
      ],
    ];

    for (const [before, after] of cases)
      expect(reconcile(before, after).target).toEqual(after);
  });
});
