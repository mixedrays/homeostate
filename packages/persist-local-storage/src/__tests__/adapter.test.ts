// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { describePersistenceAdapter } from "../../../core/src/__tests__/persistence-adapter-suite.js";
import { createLocalStorageAdapter } from "../index.js";
import { fromBase64, toBase64 } from "../base64.js";

describePersistenceAdapter(
  "createLocalStorageAdapter",
  () => createLocalStorageAdapter(),
  () => localStorage.clear(),
);

describe("createLocalStorageAdapter", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("writes one prefixed entry per key", async () => {
    await createLocalStorageAdapter({ prefix: "app:" }).append(
      "todos",
      new Uint8Array([1]),
    );

    expect(Object.keys(localStorage)).toEqual(["app:todos"]);
  });

  it("writes to the given storage", async () => {
    await createLocalStorageAdapter({ storage: sessionStorage }).append(
      "todos",
      new Uint8Array([1]),
    );

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(1);
  });

  it("rejects when the storage is full", async () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    } as unknown as Storage;

    await expect(
      createLocalStorageAdapter({ storage: full }).append(
        "todos",
        new Uint8Array([1]),
      ),
    ).rejects.toThrow("full");
  });
});

describe("base64", () => {
  it("round-trips every byte value and large updates", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);

    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromBase64(toBase64(new Uint8Array()))).toEqual(new Uint8Array());
  });
});
