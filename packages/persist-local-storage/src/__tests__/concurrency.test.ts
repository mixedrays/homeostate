// Runs in Node, whose `navigator.locks` implements the Web Locks API.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersistenceAdapter } from "@homeostate/core";
import {
  createLocalStorageAdapter,
  type LocalStorageAdapterOptions,
} from "../index.js";

/** A `Storage` held in memory, standing in for one origin's localStorage. */
const createMemoryStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, String(value)),
    removeItem: (key) => void entries.delete(key),
    clear: () => entries.clear(),
  };
};

/**
 * `storage` as another tab sees it: its next read lets `interrupt` start, as if another tab
 * wrote right then, and returns what was stored before, so the reader goes on with a stale log.
 * `interrupted()` is the promise `interrupt` returned.
 */
const staleOnce = (storage: Storage, interrupt: () => Promise<unknown>) => {
  let interrupted: Promise<unknown> | undefined;
  const stale: Storage = {
    ...storage,
    getItem: (key) => {
      const text = storage.getItem(key);
      interrupted ??= interrupt();
      return text;
    },
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
  return { stale, interrupted: () => interrupted };
};

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const stored = async (adapter: PersistenceAdapter, key = "doc") =>
  (await adapter.load(key)).updates.map((update) => [...update]);

describe("createLocalStorageAdapter with concurrent writers", () => {
  let storage = createMemoryStorage();
  afterEach(() => {
    storage = createMemoryStorage();
    vi.unstubAllGlobals();
  });

  /** Two tabs' adapters over `storage`; the first one's next read is stale. */
  const tabs = (
    interrupt: (other: PersistenceAdapter) => Promise<unknown>,
    options: LocalStorageAdapterOptions = {},
  ) => {
    const other = createLocalStorageAdapter({ ...options, storage });
    const { stale, interrupted } = staleOnce(storage, () => interrupt(other));
    const first = createLocalStorageAdapter({ ...options, storage: stale });
    return { first, other, interrupted };
  };

  it("keeps both of two overlapping appends", async () => {
    const { first, other, interrupted } = tabs((other) =>
      other.append("doc", bytes(2)),
    );

    await first.append("doc", bytes(1));
    await interrupted();

    expect(await stored(other)).toEqual([[1], [2]]);
  });

  /** Stores updates 1 and 2, and returns the version a compaction of both would pass. */
  const storeTwo = async (): Promise<number> => {
    const adapter = createLocalStorageAdapter({ storage });
    await adapter.append("doc", bytes(1));
    await adapter.append("doc", bytes(2));
    return (await adapter.load("doc")).version;
  };

  it("keeps an append made while a compaction reads", async () => {
    const version = await storeTwo();
    const { first, other, interrupted } = tabs((other) =>
      other.append("doc", bytes(3)),
    );

    await first.compact("doc", bytes(9), version);
    await interrupted();

    expect(await stored(other)).toEqual([[9], [3]]);
  });

  it("keeps a compaction's snapshot made while an append reads", async () => {
    const version = await storeTwo();
    const { first, other, interrupted } = tabs((other) =>
      other.compact("doc", bytes(9), version),
    );

    await first.append("doc", bytes(3));
    await interrupted();

    expect(await stored(other)).toEqual([[3], [9]]);
  });

  it("keeps both snapshots of two overlapping compactions", async () => {
    const version = await storeTwo();
    const { first, other, interrupted } = tabs((other) =>
      other.compact("doc", bytes(8), version),
    );

    await first.compact("doc", bytes(9), version);
    await interrupted();

    const after = await other.load("doc");
    expect(after.updates.map((update) => [...update])).toEqual([[9], [8]]);
    expect(after.version).toBe(version + 2);
  });

  it("does not restore what a clear made while an append reads deleted", async () => {
    await storeTwo();
    const { first, other, interrupted } = tabs((other) => other.clear("doc"));

    await first.append("doc", bytes(3));
    await interrupted();

    expect(await stored(other)).toEqual([]);
  });

  it("lets another writer store the key again after a clear", async () => {
    await storeTwo();
    const first = createLocalStorageAdapter({ storage });
    const other = createLocalStorageAdapter({ storage });

    await Promise.all([first.clear("doc"), other.append("doc", bytes(3))]);

    expect(await stored(first)).toEqual([[3]]);
  });

  /** Holds the lock named `name` until the returned function is called. */
  const hold = async (name: string): Promise<() => void> => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await new Promise<void>((acquired) => {
      void navigator.locks.request(name, () => {
        acquired();
        return held;
      });
    });
    return release;
  };

  /** Whether `promise` settles within a few event-loop turns. */
  const settles = (promise: Promise<unknown>): Promise<boolean> =>
    Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
    ]);

  it("names the lock after the prefix and key", async () => {
    const release = await hold("@homeostate/persist-local-storage:app:doc");
    const adapter = createLocalStorageAdapter({ storage, prefix: "app:" });

    const append = adapter.append("doc", bytes(1));
    const compact = adapter.compact("doc", bytes(2), 0);
    const clear = adapter.clear("doc");

    expect(await settles(Promise.race([append, compact, clear]))).toBe(false);
    expect(await adapter.load("doc")).toEqual({ updates: [], version: 0 });
    release();
    await Promise.all([append, compact, clear]);
  });

  it("keeps the locks of other keys and prefixes apart", async () => {
    const release = await hold("@homeostate/persist-local-storage:app:doc");

    const writes = Promise.all([
      createLocalStorageAdapter({ storage, prefix: "app:" }).append(
        "other",
        bytes(1),
      ),
      createLocalStorageAdapter({ storage, prefix: "other:" }).append(
        "doc",
        bytes(2),
      ),
      createLocalStorageAdapter({ storage, prefix: "app:d" }).append(
        "oc2",
        bytes(3),
      ),
    ]);

    expect(await settles(writes)).toBe(true);
    release();
  });

  it("releases the lock after a failed write", async () => {
    const full: Storage = {
      ...storage,
      getItem: (key) => storage.getItem(key),
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };

    await expect(
      createLocalStorageAdapter({ storage: full }).append("doc", bytes(1)),
    ).rejects.toThrow("full");
    await createLocalStorageAdapter({ storage }).append("doc", bytes(2));

    expect(await stored(createLocalStorageAdapter({ storage }))).toEqual([[2]]);
  });

  describe("without Web Locks", () => {
    const missing = /Web Locks API.*coordination: "single-writer"/s;

    it.each([
      ["no navigator.locks", {}],
      ["no navigator", undefined],
    ])("rejects writes with %s, and still loads", async (_, navigatorStub) => {
      await storeTwo();
      const before = storage.getItem("homeostate:doc");
      vi.stubGlobal("navigator", navigatorStub);
      const adapter = createLocalStorageAdapter({ storage });

      await expect(adapter.append("doc", bytes(3))).rejects.toThrow(missing);
      await expect(adapter.compact("doc", bytes(9), 2)).rejects.toThrow(
        missing,
      );
      await expect(adapter.clear("doc")).rejects.toThrow(missing);

      expect(await stored(adapter)).toEqual([[1], [2]]);
      expect(storage.getItem("homeostate:doc")).toBe(before);
    });

    it("rejects a write with what the lock request rejected with", async () => {
      const denied = new DOMException("denied", "SecurityError");
      vi.stubGlobal("navigator", {
        locks: { request: () => Promise.reject(denied) },
      });

      await expect(
        createLocalStorageAdapter({ storage }).append("doc", bytes(1)),
      ).rejects.toBe(denied);
      expect(storage.length).toBe(0);
    });
  });

  describe('with coordination: "single-writer"', () => {
    const options: LocalStorageAdapterOptions = {
      coordination: "single-writer",
    };

    it("writes without Web Locks", async () => {
      vi.stubGlobal("navigator", undefined);
      const adapter = createLocalStorageAdapter({ ...options, storage });

      await adapter.append("doc", bytes(1));
      await adapter.compact("doc", bytes(2), 1);
      await adapter.append("doc", bytes(3));

      expect(await stored(adapter)).toEqual([[2], [3]]);
      await adapter.clear("doc");
      expect(storage.length).toBe(0);
    });

    it("does not wait for the key's lock", async () => {
      const release = await hold(
        "@homeostate/persist-local-storage:homeostate:doc",
      );

      const append = createLocalStorageAdapter({ ...options, storage }).append(
        "doc",
        bytes(1),
      );

      expect(await settles(append)).toBe(true);
      release();
    });

    it("loses an update when another tab writes during its read", async () => {
      const { first, other, interrupted } = tabs(
        (other) => other.append("doc", bytes(2)),
        options,
      );

      await first.append("doc", bytes(1));
      await interrupted();

      expect(await stored(other)).toEqual([[1]]);
    });
  });
});
