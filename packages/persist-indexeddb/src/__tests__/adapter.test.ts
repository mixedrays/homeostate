import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { createPersistence } from "@homeostate/core";
import { createYjsPersistable } from "@homeostate/crdt-yjs";
import { describePersistenceAdapter } from "../../../core/src/__tests__/persistence-adapter-suite.js";
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
    await first.whenLoaded;
    doc.getMap("shared").set("title", "persisted");
    await first.destroy();

    const restored = new Y.Doc();
    await createPersistence(createYjsPersistable(restored), create(), {
      key: "room",
    }).whenLoaded;

    expect(restored.getMap("shared").toJSON()).toEqual({ title: "persisted" });
  });
});
