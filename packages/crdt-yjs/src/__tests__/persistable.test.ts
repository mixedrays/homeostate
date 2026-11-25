import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";
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

  describe("while the document waits for an earlier update", () => {
    /**
     * Docs `a`, `b` and `c` hold `k: 1`. `u1` sets an unrelated key on `a`, and `u2` then
     * replaces `k`, so `u2` alone opens a gap.
     */
    const setup = () => {
      const doc = (clientID: number): Y.Doc => {
        const created = new Y.Doc();
        created.clientID = clientID;
        return created;
      };
      const [a, b, c] = [doc(1), doc(2), doc(3)];
      a.getMap("s").set("k", 1);
      const base = Y.encodeStateAsUpdate(a);
      Y.applyUpdate(b, base);
      Y.applyUpdate(c, base);
      const updates: Uint8Array[] = [];
      a.on("update", (update: Uint8Array) => updates.push(update));
      a.getMap("s").set("other", "x");
      a.getMap("s").set("k", 2);
      const [u1, u2] = updates as [Uint8Array, Uint8Array];
      return { b, c, u1, u2, doc };
    };

    it("stores the waiting replacement, so a reload keeps the gap and peers keep the value", async () => {
      const { b, c, u1, u2, doc } = setup();
      const adapter = createMemoryPersistenceAdapter();
      const persistence = createPersistence(createYjsPersistable(b), adapter, {
        key: "room",
        compactAfter: Infinity,
      });
      await persistence.whenLoaded;
      Y.applyUpdate(b, u2, "provider");
      await persistence.destroy();

      const reloaded = doc(2);
      await createPersistence(createYjsPersistable(reloaded), adapter, {
        key: "room",
      }).whenLoaded;
      expect(reloaded.store.pendingStructs).not.toBeNull();

      // A peer that never saw u1 or u2 waits for u1 too, and its backend keeps `k`.
      const peer = createYjsBackend(c, "s");
      peer.subscribe(() => {});
      expect(peer.read()).toEqual({ k: 1 });
      Y.applyUpdate(c, Y.encodeStateAsUpdate(reloaded));
      expect(c.store.pendingStructs).not.toBeNull();
      expect(peer.read()).toEqual({ k: 1 });

      Y.applyUpdate(reloaded, u1);
      expect(reloaded.getMap("s").get("k")).toBe(2);
      expect(reloaded.store.pendingStructs).toBeNull();
    });

    /** What `doc` emits as `update` events, and what its persistable reports. */
    const watch = (doc: Y.Doc) => {
      const emitted: Uint8Array[] = [];
      const reported: Uint8Array[] = [];
      doc.on("update", (update: Uint8Array) => emitted.push(update));
      createYjsPersistable(doc).subscribe((update) => reported.push(update));
      return { emitted, reported };
    };

    it("reports a transaction's update as it is while no gap is open", () => {
      const { b, u1, u2 } = setup();
      const { emitted, reported } = watch(b);
      b.getMap("s").set("mine", true);
      Y.applyUpdate(b, u1, "provider");
      Y.applyUpdate(b, u2, "provider");
      expect(b.store.pendingStructs).toBeNull();
      expect(reported).toEqual(emitted);
      expect(reported).toHaveLength(3);
    });

    it("reports the waiting replacement once while the gap stays open", () => {
      const { b, u2 } = setup();
      const { emitted, reported } = watch(b);
      Y.applyUpdate(b, u2, "provider");
      expect(reported[0]).not.toEqual(emitted[0]);
      b.getMap("s").set("mine", true);
      b.getText("notes").insert(0, "a");
      expect(b.store.pendingStructs).not.toBeNull();
      expect(reported.slice(1)).toEqual(emitted.slice(1));
      expect(reported).toHaveLength(3);
    });

    it("stores an update that waits whole, which emits no update event", async () => {
      const a = new Y.Doc();
      a.clientID = 1;
      const updates: Uint8Array[] = [];
      a.on("update", (update: Uint8Array) => updates.push(update));
      a.getMap("s").set("first", 1);
      a.getMap("s").set("second", 2);
      const [u1, u2] = updates as [Uint8Array, Uint8Array];
      const b = new Y.Doc();
      const adapter = createMemoryPersistenceAdapter();
      const persistence = createPersistence(createYjsPersistable(b), adapter, {
        key: "room",
        compactAfter: Infinity,
      });
      await persistence.whenLoaded;
      const emitted = vi.fn();
      b.on("update", emitted);
      Y.applyUpdate(b, u2, "provider");
      expect(emitted).not.toHaveBeenCalled();
      await persistence.destroy();

      const reloaded = new Y.Doc();
      await createPersistence(createYjsPersistable(reloaded), adapter, {
        key: "room",
      }).whenLoaded;
      Y.applyUpdate(reloaded, u1);
      expect(reloaded.getMap("s").toJSON()).toEqual({ first: 1, second: 2 });
    });
  });
});
