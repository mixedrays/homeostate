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

  it("skips a stored update it cannot apply", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const onError = vi.fn();
    await adapter.append("doc", encoder.encode("not json"));
    await adapter.append("doc", createToyDoc(["valid"]).encode());
    const doc = createToyDoc();

    await createPersistence(doc, adapter, { key: "doc", onError }).whenLoaded;

    expect(doc.ops()).toEqual(["valid"]);
    expect(onError).toHaveBeenCalledOnce();
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
