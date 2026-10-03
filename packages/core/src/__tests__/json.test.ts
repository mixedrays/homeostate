import { describe, expect, it } from "vitest";
import { toJsonValue } from "../index.js";
import { nonJsonWrites, prototypeHijacks } from "./helpers.js";

describe("toJsonValue", () => {
  it.each(nonJsonWrites)(
    "stores %s as JSON.stringify does",
    (_, _before, next, expected) => {
      expect(toJsonValue(next)).toEqual(expected);
      expect(toJsonValue(next)).toEqual(JSON.parse(JSON.stringify(next)));
    },
  );

  it("returns values that are already JSON as they are", () => {
    const value = { a: [1, { b: "x" }], c: null, d: false };

    expect(toJsonValue(value)).toBe(value);
    expect(toJsonValue("x")).toBe("x");
    expect(toJsonValue(null)).toBe(null);
  });

  it("leaves object entries out at any depth", () => {
    const result = toJsonValue({
      a: { b: [{ c: undefined, d: () => 1, e: 1 }] },
    }) as { a: { b: object[] } };

    expect(result).toEqual({ a: { b: [{ e: 1 }] } });
    expect(Object.keys(result.a.b[0])).toEqual(["e"]);
  });

  it("copies only the containers on a path to a change and never mutates its input", () => {
    const kept = { x: 1 };
    const changed = { a: undefined, b: 1 };
    const value = { kept, list: [kept, changed] };

    const result = toJsonValue(value) as typeof value;

    expect(result).toEqual({ kept: { x: 1 }, list: [{ x: 1 }, { b: 1 }] });
    expect(result).not.toBe(value);
    expect(result.list).not.toBe(value.list);
    expect(result.kept).toBe(kept);
    expect(result.list[0]).toBe(kept);
    expect(Object.keys(changed)).toEqual(["a", "b"]);
  });

  it("leaves out __proto__ keys without replacing the copy's prototype", () => {
    const result = toJsonValue(
      JSON.parse('{"a":{"__proto__":{"isAdmin":true},"b":1}}'),
    );

    expect(JSON.stringify(result)).toBe('{"a":{"b":1}}');
    expect(prototypeHijacks(result)).toEqual([]);
  });
});
