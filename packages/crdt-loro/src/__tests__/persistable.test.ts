import { decodeImportBlobMeta, LoroDoc } from "loro-crdt";
import { describe, expect, it } from "vitest";
import { describePersistableDoc } from "@homeostate/core/conformance";
import { createLoroBackend, createLoroPersistable } from "../index.js";

/** A Yjs update setting `shared.title`, as a Yjs app would have stored it. */
const yjsUpdate = new Uint8Array([
  1, 1, 158, 203, 200, 236, 15, 0, 40, 1, 6, 115, 104, 97, 114, 101, 100, 5,
  116, 105, 116, 108, 101, 1, 119, 3, 121, 106, 115, 0,
]);

describePersistableDoc("createLoroPersistable", {
  createDoc: () => new LoroDoc(),
  persistable: createLoroPersistable,
  backend: (doc) => createLoroBackend(doc, "shared"),
  exchange: (a, b) => {
    b.import(a.export({ mode: "update", from: b.version() }));
    a.import(b.export({ mode: "update", from: a.version() }));
  },
  foreignUpdate: yjsUpdate,
});

describe("createLoroPersistable with a commit made during apply", () => {
  const peerDoc = (): LoroDoc => {
    const peer = new LoroDoc();
    peer.setPeerId(1);
    peer.getMap("m").set("remote", 1);
    peer.commit();
    return peer;
  };

  it("reports what a listener commits in response, without the applied update", () => {
    const peer = peerDoc();
    const doc = new LoroDoc();
    doc.setPeerId(2);
    const persistable = createLoroPersistable(doc);
    const updates: Uint8Array[] = [];
    persistable.subscribe((update) => {
      updates.push(update);
    });
    // A container listener, which Loro runs before the document's, like a backend's.
    doc.getMap("m").subscribe(({ by }) => {
      if (by !== "import") return;
      doc.getMap("m").set("derived", 1);
      doc.commit();
    });

    persistable.apply(peer.export({ mode: "update" }));

    expect(doc.getMap("m").toJSON()).toEqual({ remote: 1, derived: 1 });
    expect(updates).toHaveLength(1);
    const peers = decodeImportBlobMeta(
      updates[0],
      false,
    ).partialEndVersionVector;
    expect([...peers.toJSON().keys()]).toEqual(["2"]);
    peer.import(updates[0]);
    expect(peer.getMap("m").toJSON()).toEqual({ remote: 1, derived: 1 });
  });

  it("does not report its own earlier changes when a restored document applies them", () => {
    const stored = peerDoc().export({ mode: "update" });
    const doc = new LoroDoc();
    doc.setPeerId(1);
    const persistable = createLoroPersistable(doc);
    const updates: Uint8Array[] = [];
    persistable.subscribe((update) => {
      updates.push(update);
    });

    persistable.apply(stored);

    expect(doc.getMap("m").toJSON()).toEqual({ remote: 1 });
    expect(updates).toEqual([]);
  });
});
