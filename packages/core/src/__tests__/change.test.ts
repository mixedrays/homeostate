import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ChangeType,
  getChanges,
  type Change,
  type Diffable,
  type EditScript,
  type ListChange,
  type RecordChange,
  type TextChange,
} from "../index.js";

// These checks run when the test files are type-checked, as `pnpm typecheck` does.
describe("Change types", () => {
  it("names each step type with a const object", () => {
    expect(ChangeType).toEqual({
      INSERT: "insert",
      UPDATE: "update",
      DELETE: "delete",
      PENDING: "pending",
    });
    expectTypeOf<ChangeType>().toEqualTypeOf<
      "insert" | "update" | "delete" | "pending"
    >();
  });

  it("returns the script of the kind of the values diffed", () => {
    expectTypeOf(getChanges("a", "b")).toEqualTypeOf<TextChange[]>();
    expectTypeOf(getChanges([1], [2])).toEqualTypeOf<ListChange[]>();
    expectTypeOf(getChanges({ a: 1 }, { a: 2 })).toEqualTypeOf<
      RecordChange[]
    >();
    expectTypeOf(
      getChanges("a" as Diffable, ["a"] as Diffable),
    ).toEqualTypeOf<EditScript>();
  });

  it("narrows a key to the kind of its container", () => {
    expectTypeOf<RecordChange["key"]>().toEqualTypeOf<string>();
    expectTypeOf<ListChange["key"]>().toEqualTypeOf<number>();
    expectTypeOf<TextChange["key"]>().toEqualTypeOf<number>();
  });

  it("narrows a pending step's script by its kind", () => {
    const [change] = getChanges({ t: "a" }, { t: "ab" });
    if (change.type === ChangeType.PENDING && change.kind === "text")
      expectTypeOf(change.changes).toEqualTypeOf<TextChange[]>();
    if (change.type === ChangeType.PENDING && change.kind === "list")
      expectTypeOf(change.changes).toEqualTypeOf<ListChange[]>();
    if (change.type === ChangeType.PENDING && change.kind === "record")
      expectTypeOf(change.changes).toEqualTypeOf<RecordChange[]>();
  });

  it("rejects steps no script holds", () => {
    const rejected: Change[] = [
      // @ts-expect-error A record delete has no count.
      { type: "delete", key: "a", count: 2 },
      // @ts-expect-error A pending step names the kind of its script.
      { type: "pending", key: 0, changes: [] },
    ];
    // @ts-expect-error A text insert carries a string.
    const insert: TextChange = { type: "insert", key: 0, value: 1 };
    // @ts-expect-error A text script has no update.
    const update: TextChange = { type: "update", key: 0, value: "x" };
    // @ts-expect-error A list key is a number.
    const stringIndex: ListChange = { type: "insert", key: "0", value: 1 };
    expect([...rejected, insert, update, stringIndex]).toHaveLength(5);
  });
});
