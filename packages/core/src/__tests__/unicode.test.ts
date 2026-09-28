import { describe, expect, it } from "vitest";
import { applyChanges, applyStringChanges, type ApplyOps } from "../apply.js";
import { ChangeType } from "../change.js";
import { getChanges } from "../diff.js";
import { patchState } from "../patching.js";
import { unicodeEdits } from "./helpers.js";

const ops: ApplyOps = {
  set: (target, key, value) => {
    (target as Record<string, unknown>)[key] = value;
  },
  remove: (target, key) => {
    delete (target as Record<string, unknown>)[key];
  },
  splice: (target, index, count, inserted) => {
    target.splice(index, count, ...inserted);
  },
};

/** A surrogate is valid only as part of a pair, which iteration returns as one code point. */
const isWellFormed = (text: string) =>
  [...text].every((character) => {
    const point = character.codePointAt(0)!;
    return point < 0xd800 || point > 0xdfff;
  });

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

  const target = { items: [{ text: before }] };
  const item = target.items[0];
  applyChanges(target, getChanges(target, { items: [{ text: after }] }), ops);
  expect(target).toEqual({ items: [{ text: after }] });
  expect(target.items[0]).toBe(item);
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
