import { describe, expect, it } from "vitest";
import {
  editDraft,
  followValue,
  markApplied,
  readDraft,
  startDraft,
  type DraftFormat,
} from "../panel/draft";
import type { Json } from "../json";

const json: DraftFormat = {
  format: (value) => JSON.stringify(value),
  parse: (text) => {
    try {
      return { ok: true, value: JSON.parse(text) as Json };
    } catch {
      return { ok: false, error: "Not JSON" };
    }
  },
};

describe("draft", () => {
  it("starts from the value's text, clean and not committable", () => {
    const draft = startDraft({ a: 1 }, json);

    expect(draft.text).toBe('{"a":1}');
    expect(readDraft(draft, { a: 1 }, json)).toMatchObject({
      dirty: false,
      stale: false,
      canCommit: false,
    });
  });

  it("can commit an edited draft that parses", () => {
    const draft = editDraft(startDraft({ a: 1 }, json), '{"a":2}');

    expect(readDraft(draft, { a: 1 }, json)).toEqual({
      dirty: true,
      stale: false,
      parsed: { ok: true, value: { a: 2 } },
      canCommit: true,
    });
  });

  it("cannot commit a draft that does not parse", () => {
    const draft = editDraft(startDraft({ a: 1 }, json), '{"a":');

    expect(readDraft(draft, { a: 1 }, json)).toMatchObject({
      dirty: true,
      parsed: { ok: false, error: "Not JSON" },
      canCommit: false,
    });
  });

  it("is clean again once the text is back to where editing began", () => {
    const draft = editDraft(
      editDraft(startDraft({ a: 1 }, json), '{"a":2}'),
      '{"a":1}',
    );

    expect(readDraft(draft, { a: 1 }, json).dirty).toBe(false);
  });

  it("follows the value until edited", () => {
    const draft = followValue(startDraft({ a: 1 }, json), { a: 2 }, json);

    expect(draft.text).toBe('{"a":2}');
    expect(readDraft(draft, { a: 2 }, json)).toMatchObject({
      dirty: false,
      stale: false,
    });
  });

  it("keeps an edited draft when the value changes, as stale and not committable", () => {
    const edited = editDraft(startDraft({ a: 1 }, json), '{"a":3}');
    const draft = followValue(edited, { a: 2 }, json);

    expect(draft).toBe(edited);
    expect(readDraft(draft, { a: 2 }, json)).toMatchObject({
      dirty: true,
      stale: true,
      parsed: { ok: true, value: { a: 3 } },
      canCommit: false,
    });
  });

  it("compares values, not their text, to tell a stale draft", () => {
    const draft = editDraft(startDraft({ a: 1, b: 2 }, json), '{"a":3}');

    expect(readDraft(draft, { b: 2, a: 1 }, json)).toMatchObject({
      stale: false,
      canCommit: true,
    });
  });

  it("loads the latest value over a stale draft", () => {
    const stale = editDraft(startDraft({ a: 1 }, json), '{"a":3}');
    const draft = startDraft({ a: 2 }, json);

    expect(readDraft(stale, { a: 2 }, json).stale).toBe(true);
    expect(draft.text).toBe('{"a":2}');
    expect(readDraft(draft, { a: 2 }, json)).toMatchObject({
      dirty: false,
      stale: false,
    });
  });

  it("is clean and keeps its text once applied", () => {
    const edited = editDraft(startDraft({ a: 1 }, json), '{ "a": 2 }');
    const draft = markApplied(edited, { a: 2 });

    expect(draft.text).toBe('{ "a": 2 }');
    expect(readDraft(draft, { a: 2 }, json)).toMatchObject({
      dirty: false,
      stale: false,
    });
    expect(followValue(draft, { a: 2 }, json)).toBe(draft);
  });

  it("takes its parser, which may read the text by the value editing began with", () => {
    const text: DraftFormat = {
      format: (value) =>
        typeof value === "string" ? value : JSON.stringify(value),
      parse: (input, base) =>
        typeof base === "string"
          ? { ok: true, value: input }
          : { ok: true, value: JSON.parse(input) as Json },
    };
    const draft = editDraft(startDraft("5", text), "6");

    expect(readDraft(draft, "5", text).parsed).toEqual({
      ok: true,
      value: "6",
    });
  });

  it("takes its equality", () => {
    const loose: DraftFormat = { ...json, equal: () => true };
    const draft = editDraft(startDraft({ a: 1 }, loose), '{"a":3}');

    expect(followValue(startDraft({ a: 1 }, loose), { a: 2 }, loose).text).toBe(
      '{"a":1}',
    );
    expect(readDraft(draft, { a: 2 }, loose)).toMatchObject({
      stale: false,
      canCommit: true,
    });
  });
});
