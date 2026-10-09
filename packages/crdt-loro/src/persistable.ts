import type { LoroDoc } from "loro-crdt";
import type { PersistableDoc, Unsubscribe } from "@homeostate/core";

/**
 * Exposes a whole LoroDoc to `createPersistence`: `encode` exports a snapshot, and each
 * commit or import is reported as the update since the last one.
 */
export const createLoroPersistable = (doc: LoroDoc): PersistableDoc => {
  let applying = false;

  return {
    encode: () => doc.export({ mode: "snapshot" }),

    apply: (update) => {
      // Report pending local edits before the import, which would commit them silently.
      doc.commit();
      applying = true;
      try {
        doc.import(update);
      } finally {
        applying = false;
      }
    },

    subscribe: (onUpdate): Unsubscribe => {
      let saved = doc.oplogVersion();
      return doc.subscribe(() => {
        const version = doc.oplogVersion();
        if (version.compare(saved) === 0) return;
        const update = doc.export({ mode: "update", from: saved });
        saved = version;
        if (!applying) onUpdate(update);
      });
    },
  };
};
