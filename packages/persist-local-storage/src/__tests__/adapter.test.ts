// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistence, type PersistableDoc } from "@homeostate/core";
import { describePersistenceAdapter } from "@homeostate/core/conformance";
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

/** A document of strings, stored as JSON arrays; `apply` throws for anything else. */
const createListDoc = (initial: string[] = []) => {
  const items = new Set(initial);
  const persistable: PersistableDoc = {
    encode: () => new TextEncoder().encode(JSON.stringify([...items])),
    apply: (update) => {
      for (const item of JSON.parse(
        new TextDecoder().decode(update),
      ) as string[])
        items.add(item);
    },
    subscribe: () => () => {},
  };
  return { persistable, items: () => [...items].sort() };
};

describe("createLocalStorageAdapter with createPersistence", () => {
  beforeEach(() => localStorage.clear());

  const load = (doc = createListDoc(), onError = vi.fn()) =>
    createPersistence(doc.persistable, createLocalStorageAdapter(), {
      key: "todos",
      onError,
    });

  it("loads empty on a first visit, then loaded on the next", async () => {
    const first = load(createListDoc(["seed"]));
    await expect(first.whenLoaded).resolves.toEqual({ status: "empty" });
    await first.destroy();

    const doc = createListDoc();
    await expect(load(doc).whenLoaded).resolves.toEqual({ status: "loaded" });
    expect(doc.items()).toEqual(["seed"]);
  });

  it("loads partially when a stored update cannot be applied", async () => {
    const adapter = createLocalStorageAdapter();
    await adapter.append("todos", new Uint8Array([255, 254]));
    await adapter.append("todos", createListDoc(["kept"]).persistable.encode());
    const doc = createListDoc();

    await expect(load(doc).whenLoaded).resolves.toEqual({
      status: "partial",
      errors: [expect.any(SyntaxError)],
    });
    expect(doc.items()).toEqual(["kept"]);
  });

  it("fails to load an entry that is not a stored log, and keeps it", async () => {
    localStorage.setItem("homeostate:todos", "{ not json");

    const loaded = await load().whenLoaded;

    expect(loaded).toEqual({
      status: "failed",
      error: expect.any(SyntaxError),
    });
    expect(localStorage.getItem("homeostate:todos")).toBe("{ not json");
  });
});

describe("base64", () => {
  it("round-trips every byte value and large updates", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);

    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromBase64(toBase64(new Uint8Array()))).toEqual(new Uint8Array());
  });
});
