import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { createPersistence } from "@homeostate/core";
import { describePersistableDoc } from "@homeostate/core/conformance";
import { createMemoryPersistenceAdapter } from "@homeostate/core/testing";
import { createYjsBackend, createYjsPersistable } from "../index.js";

describePersistableDoc("createYjsPersistable", {
  createDoc: () => new Y.Doc(),
  persistable: createYjsPersistable,
  backend: (doc) => createYjsBackend(doc, "shared"),
  exchange: (a, b) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  },
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
