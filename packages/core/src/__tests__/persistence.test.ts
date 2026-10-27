import { describe, expect, it, vi } from "vitest";
import {
  createPersistence,
  type PersistableDoc,
  type PersistenceAdapter,
} from "../index.js";
import { createMemoryPersistenceAdapter } from "../testing.js";
import { describePersistenceAdapter } from "./persistence-adapter-suite.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface ToyDoc extends PersistableDoc {
  /** A local edit */
  add: (op: string) => void;
  /** An update from a peer, as a provider would apply it */
  receive: (update: Uint8Array) => void;
  ops: () => string[];
}

/** A grow-only set of strings: the smallest CRDT that behaves like a document. */
const createToyDoc = (initial: string[] = []): ToyDoc => {
  const ops = new Set(initial);
  const listeners = new Set<(update: Uint8Array) => void>();

  const encodeOps = (list: string[]) => encoder.encode(JSON.stringify(list));
  const merge = (update: Uint8Array): string[] => {
    const incoming = JSON.parse(decoder.decode(update)) as string[];
    const fresh = incoming.filter((op) => !ops.has(op));
    fresh.forEach((op) => ops.add(op));
    return fresh;
  };
  const emit = (list: string[]) => {
    if (list.length > 0) listeners.forEach((l) => l(encodeOps(list)));
  };

  return {
    encode: () => encodeOps([...ops]),
    apply: (update) => {
      merge(update);
    },
    subscribe: (onUpdate) => {
      listeners.add(onUpdate);
      return () => {
        listeners.delete(onUpdate);
      };
    },
    add: (op) => {
      if (ops.has(op)) return;
      ops.add(op);
      emit([op]);
    },
    receive: (update) => emit(merge(update)),
    ops: () => [...ops].sort(),
  };
};

const restore = async (adapter: PersistenceAdapter, key = "doc") => {
  const doc = createToyDoc();
  const persistence = createPersistence(doc, adapter, { key });
  await persistence.whenLoaded;
  return { doc, persistence };
};

/** The oldest `count` updates stored under `key`. */
const storedPrefix = async (
  adapter: PersistenceAdapter,
  count: number,
  key = "doc",
) => (await adapter.load(key)).updates.slice(0, count);

describe("createPersistence", () => {
  it("restores local edits into a new document", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    doc.add("b");
    await persistence.destroy();

    const { doc: restored } = await restore(adapter);

    expect(restored.ops()).toEqual(["a", "b"]);
  });

  it("stores updates received from peers", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    const peer = createToyDoc(["remote"]);
    doc.receive(peer.encode());
    await persistence.flush();

    expect((await restore(adapter)).doc.ops()).toEqual(["remote"]);
  });

  it("stores what the document held before it was persisted", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const doc = createToyDoc(["seed"]);
    await createPersistence(doc, adapter, { key: "doc" }).flush();

    expect((await restore(adapter)).doc.ops()).toEqual(["seed"]);
  });

  it("does not store the updates it loaded again", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    doc.add("b");
    await persistence.destroy();
    expect(adapter.size("doc")).toBe(3);

    const reloaded = await restore(adapter);
    await reloaded.persistence.flush();

    expect(adapter.size("doc")).toBe(1);
  });

  it("stores updates made while loading", async () => {
    const adapter = createMemoryPersistenceAdapter();
    await adapter.append("doc", createToyDoc(["stored"]).encode());
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, { key: "doc" });
    doc.add("early");
    await persistence.flush();

    expect(doc.ops()).toEqual(["early", "stored"]);
    expect((await restore(adapter)).doc.ops()).toEqual(["early", "stored"]);
  });

  it("compacts the log every compactAfter updates", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      compactAfter: 3,
    });
    for (const op of ["a", "b", "c", "d"]) doc.add(op);
    await persistence.flush();

    expect(adapter.size("doc")).toBe(2);
    expect((await restore(adapter)).doc.ops()).toEqual(["a", "b", "c", "d"]);
  });

  it("compacts the log on demand", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    doc.add("b");
    await persistence.flush();
    expect(adapter.size("doc")).toBe(3);

    await persistence.compact();

    expect(adapter.size("doc")).toBe(1);
    expect((await restore(adapter)).doc.ops()).toEqual(["a", "b"]);
  });

  it("does not compact once storing has stopped", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    await persistence.clear();
    await persistence.compact();

    expect(adapter.size("doc")).toBe(0);
  });

  it("reports what is stored once pending writes finish", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    doc.add("b");

    const stats = await persistence.stats();

    const { updates } = await adapter.load("doc");
    expect(stats).toEqual({
      updates: 3,
      bytes: updates.reduce((total, update) => total + update.byteLength, 0),
    });
  });

  it("rejects stats when storage cannot be read", async () => {
    const error = new Error("storage unavailable");
    const memory = createMemoryPersistenceAdapter();
    let failing = false;
    const adapter: PersistenceAdapter = {
      ...memory,
      load: (key) => (failing ? Promise.reject(error) : memory.load(key)),
    };
    const { persistence } = await restore(adapter);
    failing = true;

    await expect(persistence.stats()).rejects.toBe(error);
  });

  it("compacts only on load with compactAfter Infinity", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      compactAfter: Infinity,
    });
    for (let i = 0; i < 150; i++) doc.add(`op-${i}`);
    await persistence.flush();

    expect(adapter.size("doc")).toBe(151);
  });

  it("never runs two storage calls at once", async () => {
    const memory = createMemoryPersistenceAdapter();
    let running = 0;
    let overlapped = false;
    const tracked =
      <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        overlapped ||= running > 0;
        running++;
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
          return await call(...args);
        } finally {
          running--;
        }
      };
    const adapter: PersistenceAdapter = {
      load: tracked(memory.load),
      append: tracked(memory.append),
      compact: tracked(memory.compact),
      clear: tracked(memory.clear),
    };
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      compactAfter: 2,
    });
    for (const op of ["a", "b", "c"]) doc.add(op);
    await persistence.flush();

    expect(overlapped).toBe(false);
    expect((await restore(memory)).doc.ops()).toEqual(["a", "b", "c"]);
  });

  it("keeps every document's updates when several share a key", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const config = { key: "doc", compactAfter: 2 };
    const first = createToyDoc();
    const second = createToyDoc();
    const firstPersistence = createPersistence(first, adapter, config);
    const secondPersistence = createPersistence(second, adapter, config);

    for (const n of [1, 2, 3, 4, 5]) {
      first.add(`first-${n}`);
      second.add(`second-${n}`);
    }
    await Promise.all([
      firstPersistence.destroy(),
      secondPersistence.destroy(),
    ]);

    expect((await restore(adapter)).doc.ops()).toEqual([
      "first-1",
      "first-2",
      "first-3",
      "first-4",
      "first-5",
      "second-1",
      "second-2",
      "second-3",
      "second-4",
      "second-5",
    ]);
  });

  it("stops storing after destroy and keeps what was stored", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("kept");
    await persistence.destroy();
    doc.add("dropped");

    expect((await restore(adapter)).doc.ops()).toEqual(["kept"]);
  });

  it("removes the stored document on clear", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    await persistence.clear();
    doc.add("b");
    await persistence.flush();

    expect(adapter.size("doc")).toBe(0);
  });

  it("still removes the stored document on clear after destroy", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const { doc, persistence } = await restore(adapter);
    doc.add("a");
    await persistence.destroy();
    await persistence.destroy();

    await persistence.clear();

    expect(adapter.size("doc")).toBe(0);
  });

  it("still loads when storage fails, and reports the error", async () => {
    const error = new Error("storage unavailable");
    const onError = vi.fn();
    const adapter: PersistenceAdapter = {
      ...createMemoryPersistenceAdapter(),
      load: () => Promise.reject(error),
    };

    await createPersistence(createToyDoc(), adapter, { key: "doc", onError })
      .whenLoaded;

    expect(onError).toHaveBeenCalledWith(error);
  });

  it("applies the stored updates it can and keeps the one it cannot apply", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const onError = vi.fn();
    const stored = [
      encoder.encode("not json"),
      createToyDoc(["valid"]).encode(),
    ];
    for (const update of stored) await adapter.append("doc", update);
    const doc = createToyDoc();

    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      onError,
    });
    await persistence.whenLoaded;
    await persistence.flush();

    expect(doc.ops()).toEqual(["valid"]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
    expect(await storedPrefix(adapter, stored.length)).toEqual(stored);
  });

  it("stores what the document held before it was persisted when it keeps the log", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const corrupt = encoder.encode("not json");
    await adapter.append("doc", corrupt);
    const doc = createToyDoc(["seed"]);

    await createPersistence(doc, adapter, {
      key: "doc",
      onError: vi.fn(),
    }).flush();

    const restored = createToyDoc();
    await createPersistence(restored, adapter, {
      key: "doc",
      onError: vi.fn(),
    }).flush();
    expect(restored.ops()).toEqual(["seed"]);
    expect(await storedPrefix(adapter, 1)).toEqual([corrupt]);
  });

  it("keeps a log it cannot apply, with other writers' entries, through every compaction", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const corrupt = encoder.encode("not json");
    // Another writer's snapshot, the update it cannot read, and another writer's append.
    await adapter.append("doc", createToyDoc(["other"]).encode());
    await adapter.compact("doc", createToyDoc(["snapshot"]).encode(), 1);
    await adapter.append("doc", corrupt);
    await adapter.append("doc", createToyDoc(["later"]).encode());
    const stored = (await adapter.load("doc")).updates;
    const onError = vi.fn();
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      compactAfter: 2,
      onError,
    });

    for (const op of ["a", "b", "c"]) doc.add(op);
    await persistence.flush();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(await storedPrefix(adapter, stored.length)).toEqual(stored);

    await persistence.compact();

    expect(onError).toHaveBeenCalledTimes(3);
    expect(await storedPrefix(adapter, stored.length)).toEqual(stored);
    const restored = createToyDoc();
    await createPersistence(restored, adapter, {
      key: "doc",
      onError: vi.fn(),
    }).flush();
    expect(restored.ops()).toEqual(["a", "b", "c", "later", "snapshot"]);
  });

  it("removes a log it cannot apply on clear, and compacts again after", async () => {
    const adapter = createMemoryPersistenceAdapter();
    await adapter.append("doc", encoder.encode("not json"));
    const doc = createToyDoc(["kept"]);
    await createPersistence(doc, adapter, {
      key: "doc",
      onError: vi.fn(),
    }).clear();
    expect(adapter.size("doc")).toBe(0);

    const { doc: next, persistence } = await restore(adapter);
    next.add("a");
    await persistence.compact();

    expect(adapter.size("doc")).toBe(1);
    expect((await restore(adapter)).doc.ops()).toEqual(["a"]);
  });

  it("reports a failed append and keeps storing later updates", async () => {
    const error = new Error("quota exceeded");
    const onError = vi.fn();
    const memory = createMemoryPersistenceAdapter();
    const adapter: PersistenceAdapter = {
      ...memory,
      append: vi.fn(memory.append).mockRejectedValueOnce(error),
    };
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      onError,
    });
    await persistence.whenLoaded;

    doc.add("lost");
    doc.add("kept");
    await persistence.flush();

    expect(onError).toHaveBeenCalledWith(error);
    expect((await restore(memory)).doc.ops()).toEqual(["kept"]);
  });

  it("reports a failed compaction and keeps the log it could not replace", async () => {
    const error = new Error("quota exceeded");
    const onError = vi.fn();
    const memory = createMemoryPersistenceAdapter();
    const compact = vi.fn(memory.compact);
    const adapter: PersistenceAdapter = { ...memory, compact };
    const doc = createToyDoc();
    const persistence = createPersistence(doc, adapter, {
      key: "doc",
      onError,
    });
    doc.add("a");
    await persistence.flush();
    compact.mockRejectedValueOnce(error);

    await persistence.compact();

    expect(onError).toHaveBeenCalledWith(error);
    expect(memory.size("doc")).toBe(2);
    expect((await restore(memory)).doc.ops()).toEqual(["a"]);
  });

  it("logs storage failures to the console by default", async () => {
    const error = new Error("storage unavailable");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const adapter: PersistenceAdapter = {
      ...createMemoryPersistenceAdapter(),
      load: () => Promise.reject(error),
    };

    try {
      await createPersistence(createToyDoc(), adapter, { key: "doc" })
        .whenLoaded;

      expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
    } finally {
      consoleError.mockRestore();
    }
  });
});

const shared = { adapter: createMemoryPersistenceAdapter() };
describePersistenceAdapter(
  "createMemoryPersistenceAdapter",
  () => shared.adapter,
  () => {
    shared.adapter = createMemoryPersistenceAdapter();
  },
);
