import { describe, expect, it } from "vitest";
import { applyChanges, applyStringChanges, type ApplyOps } from "../apply.js";
import { ChangeType } from "../change.js";
import { getChanges } from "../diff.js";
import { patchState } from "../patching.js";
import { unicodeEdits } from "./helpers.js";

/** A surrogate is valid only as part of a pair, which iteration returns as one code point. */
const isWellFormed = (text: string) =>
  [...text].every((character) => {
    const point = character.codePointAt(0)!;
    return point < 0xd800 || point > 0xdfff;
  });

/** Text edited in place, as a CRDT text is; its JSON is the string. */
class Text {
  constructor(public value: string) {}
  toJSON(): string {
    return this.value;
  }
}

type Plain = Record<string | number, unknown>;

const ops: ApplyOps = {
  kind: (value) =>
    value instanceof Text
      ? "text"
      : Array.isArray(value)
        ? "list"
        : value !== null && typeof value === "object"
          ? "record"
          : undefined,
  get: (container, key) => (container as Plain)[key],
  set: (container, key, value) => {
    (container as Plain)[key] = value;
  },
  remove: (container, key) => {
    delete (container as Plain)[key];
  },
  splice: (list, index, count, inserted) => {
    (list as unknown[]).splice(index, count, ...inserted);
  },
  editText: (text, index, count, inserted) => {
    const { value } = text as Text;
    (text as Text).value =
      value.slice(0, index) + inserted + value.slice(index + count);
    // Each edit must leave valid text, as a CRDT text applies them one by one.
    expect(isWellFormed((text as Text).value)).toBe(true);
  },
};

function checkEdits(before: string, after: string) {
  const changes = getChanges(before, after);
  let current = before;
  for (const change of changes) {
    current = applyStringChanges(current, [change]);
    // A correct final string alone can hide invalid intermediate CRDT operations.
    expect(isWellFormed(current)).toBe(true);
  }
  expect(current).toBe(after);
  expect(patchState({ text: before }, { text: after })).toEqual({
    text: after,
  });

  const text = new Text(before);
  const target = { items: [{ text }] };
  applyChanges(
    target,
    { items: [{ text: before }] },
    { items: [{ text: after }] },
    ops,
  );
  expect(text.value).toBe(after);
  expect(target.items[0].text).toBe(text);
}

describe("Unicode string edits", () => {
  it.each(unicodeEdits)(
    "patches %j to %j without splitting a pair",
    checkEdits,
  );

  it("uses UTF-16 offsets and a whole-pair deletion span", () => {
    expect(getChanges("😀a😃b", "😀ab")).toEqual([[ChangeType.DELETE, 3, 2]]);
    expect(getChanges("😀ab", "😀aXb")).toEqual([[ChangeType.INSERT, 3, "X"]]);
  });

  it("preserves valid text through generated edit sequences", () => {
    const alphabet = ["a", "b", "😀", "😃", "𐐀", "é", "\u0301", "\u200d"];
    let seed = 42;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const string = () =>
      Array.from(
        { length: random() % 12 },
        () => alphabet[(random() >>> 16) % alphabet.length],
      ).join("");
    for (let i = 0; i < 500; i++) checkEdits(string(), string());
  });
});
