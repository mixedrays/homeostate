import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersistence } from "@homeostate/core";
import { createYjsPersistable } from "@homeostate/crdt-yjs";
import { describePersistenceAdapter } from "@homeostate/core/conformance";
import { createIndexedDbAdapter, type IndexedDbAdapter } from "../index.js";

let factory = new IDBFactory();
const opened: IndexedDbAdapter[] = [];

const create = (name?: string): IndexedDbAdapter => {
  const adapter = createIndexedDbAdapter({ name, indexedDB: factory });
  opened.push(adapter);
  return adapter;
};

afterEach(() => {
  opened.splice(0).forEach((adapter) => adapter.close());
});

describePersistenceAdapter(
  "createIndexedDbAdapter",
  () => create(),
  () => {
    factory = new IDBFactory();
  },
);

describe("createIndexedDbAdapter", () => {
  it("uses the global indexedDB by default", async () => {
    const adapter = createIndexedDbAdapter({ name: "global" });
    await adapter.append("doc", new Uint8Array([1]));

    expect(
      (await createIndexedDbAdapter({ name: "global" }).load("doc")).updates,
    ).toEqual([new Uint8Array([1])]);
    adapter.close();
  });

  it("keeps databases apart by name", async () => {
    await create("a").append("doc", new Uint8Array([1]));

    expect((await create("b").load("doc")).updates).toEqual([]);
  });

  it("reopens the database after close", async () => {
    const adapter = create();
    await adapter.append("doc", new Uint8Array([1]));
    adapter.close();

    expect((await adapter.load("doc")).updates).toEqual([new Uint8Array([1])]);
  });

  it("lets another connection delete the database", async () => {
    const adapter = create();
    await adapter.append("doc", new Uint8Array([1]));

    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase("homeostate");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    expect(await adapter.load("doc")).toEqual({ updates: [], version: 0 });
  });

  it("restores a Yjs document across page loads", async () => {
    const doc = new Y.Doc();
    const first = createPersistence(createYjsPersistable(doc), create(), {
      key: "room",
    });
    await expect(first.whenLoaded).resolves.toEqual({ status: "empty" });
    doc.getMap("shared").set("title", "persisted");
    await first.destroy();

    const restored = new Y.Doc();
    await expect(
      createPersistence(createYjsPersistable(restored), create(), {
        key: "room",
      }).whenLoaded,
    ).resolves.toEqual({ status: "loaded" });

    expect(restored.getMap("shared").toJSON()).toEqual({ title: "persisted" });
  });

  it("loads a Yjs document partially when a stored update cannot be applied", async () => {
    // A database of its own: the previous test may still be writing its snapshot to the default one.
    const adapter = create("partial");
    const source = new Y.Doc();
    source.getMap("shared").set("title", "kept");
    await adapter.append("room", new Uint8Array([255, 254, 253]));
    await adapter.append("room", Y.encodeStateAsUpdate(source));
    const onError = vi.fn();
    const restored = new Y.Doc();

    const loaded = await createPersistence(
      createYjsPersistable(restored),
      adapter,
      { key: "room", onError },
    ).whenLoaded;

    expect(loaded).toEqual({
      status: "partial",
      errors: [onError.mock.calls[0][0]],
    });
    expect(restored.getMap("shared").toJSON()).toEqual({ title: "kept" });
  });

  it("fails to load when the database cannot be opened", async () => {
    const error = new DOMException(
      "The operation is insecure.",
      "SecurityError",
    );
    const blocked = {
      open: () => {
        throw error;
      },
    } as unknown as IDBFactory;
    const adapter = createIndexedDbAdapter({ indexedDB: blocked });

    const loaded = await createPersistence(
      createYjsPersistable(new Y.Doc()),
      adapter,
      { key: "room", onError: vi.fn() },
    ).whenLoaded;

    expect(loaded).toEqual({ status: "failed", error });
  });
});
