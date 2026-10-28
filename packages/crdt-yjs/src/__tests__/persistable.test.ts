import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { createPersistence } from "@homeostate/core";
import { describePersistableDoc } from "@homeostate/core/conformance";
import { createMemoryPersistenceAdapter } from "@homeostate/core/testing";
import { createYjsBackend, createYjsPersistable } from "../index.js";

/** A Loro update setting `shared.title`, as a Loro app would have stored it. */
const loroUpdate = new Uint8Array([
  108, 111, 114, 111, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 223, 156, 86, 253, 0,
  4, 73, 0, 1, 0, 1, 1, 16, 1, 14, 238, 254, 101, 215, 207, 229, 215, 1, 1, 0,
  0, 0, 0, 0, 5, 1, 0, 0, 1, 0, 6, 1, 4, 1, 0, 0, 2, 13, 5, 116, 105, 116, 108,
  101, 6, 115, 104, 97, 114, 101, 100, 0, 14, 1, 4, 2, 1, 0, 2, 1, 0, 2, 1, 11,
  2, 1, 1, 0, 6, 5, 4, 108, 111, 114, 111,
]);

describePersistableDoc("createYjsPersistable", {
  createDoc: () => new Y.Doc(),
  persistable: createYjsPersistable,
  backend: (doc) => createYjsBackend(doc, "shared"),
  exchange: (a, b) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  },
  foreignUpdate: loroUpdate,
});

describe("createYjsPersistable", () => {
  it("stores every shared type in the document, not only the synced map", async () => {
    const adapter = createMemoryPersistenceAdapter();
    const doc = new Y.Doc();
    const persistence = createPersistence(createYjsPersistable(doc), adapter, {
      key: "room",
    });
    doc.getText("notes").insert(0, "Buy milk");
    doc.getArray("log").push(["opened"]);
    await persistence.destroy();

    const restored = new Y.Doc();
    await createPersistence(createYjsPersistable(restored), adapter, {
      key: "room",
    }).whenLoaded;

    expect(restored.getText("notes").toString()).toBe("Buy milk");
    expect(restored.getArray("log").toJSON()).toEqual(["opened"]);
  });
});
