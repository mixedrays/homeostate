import { describe, expect, it } from "vitest";
import { jsonEqual, toJsonValue } from "../index.js";
import {
  nonJsonWrites,
  prototypeHijacks,
  prototypeMemberKeys,
} from "./helpers.js";

describe("toJsonValue", () => {
  it.each(nonJsonWrites)(
    "stores %s as JSON.stringify does",
    (_, _before, next, expected) => {
      expect(toJsonValue(next)).toStrictEqual(expected);
      expect(toJsonValue(next)).toStrictEqual(JSON.parse(JSON.stringify(next)));
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

describe("jsonEqual", () => {
  it.each(nonJsonWrites)(
    "compares %s as JSON.stringify stores them",
    (_, _before, next, expected) => {
      expect(jsonEqual(next, expected)).toBe(true);
      expect(jsonEqual(expected, next)).toBe(true);
    },
  );

  it("tells different values apart at any depth", () => {
    expect(jsonEqual({ a: [{ b: 1 }] }, { a: [{ b: 2 }] })).toBe(false);
    expect(jsonEqual({ a: [1] }, { a: [1, 2] })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual([1], { 0: 1 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });

  it.each(prototypeMemberKeys)(
    "never finds a %s key on an object that lacks it",
    (key) => {
      expect(jsonEqual({ [key]: {} }, {})).toBe(false);
      expect(jsonEqual({}, { [key]: {} })).toBe(false);
      expect(jsonEqual({ a: { [key]: 1 } }, { a: {} })).toBe(false);
      expect(jsonEqual({ [key]: 1 }, { [key]: 1 })).toBe(true);
    },
  );

  it("ignores __proto__ keys and prototypes on both sides", () => {
    const owned = JSON.parse('{"a":1,"__proto__":{"isAdmin":true}}');
    const inherited = Object.assign(Object.create({ isAdmin: true }), {
      a: 1,
    }) as object;

    expect(jsonEqual(owned, { a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, owned)).toBe(true);
    expect(jsonEqual(inherited, { a: 1 })).toBe(true);
    expect(jsonEqual(JSON.parse('{"__proto__":{}}'), {})).toBe(true);
    expect(jsonEqual(JSON.parse('{"__proto__":{}}'), { b: 1 })).toBe(false);
  });
});
