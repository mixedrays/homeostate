import { decodeImportBlobMeta, VersionVector, type LoroDoc } from "loro-crdt";
import type { PersistableDoc, Unsubscribe } from "@homeostate/core";

/**
 * Exposes a whole LoroDoc to `createPersistence`: `encode` exports a snapshot, and each
 * commit or import is reported as the update since the last one.
 */
export const createLoroPersistable = (doc: LoroDoc): PersistableDoc => {
  /** The update `apply` is importing. */
  let importing: Uint8Array | undefined;

  /**
   * The version after which `version` holds only what this document committed while importing
   * `update`, or `undefined` for nothing. Loro runs container listeners first, so a response such
   * as the engine's write can share the import's batch.
   */
  const committedSince = (
    saved: VersionVector,
    version: VersionVector,
    update: Uint8Array,
  ): VersionVector | undefined => {
    const peer = doc.peerIdStr;
    const end = version.get(peer) ?? 0;
    const before = saved.get(peer) ?? 0;
    if (end <= before) return undefined;
    // The update may carry this peer's own earlier changes, as when a document restored with
    // the same peer ID loads what it stored.
    const imported =
      decodeImportBlobMeta(update, false).partialEndVersionVector.get(peer) ??
      0;
    const known = Math.max(before, imported);
    if (end <= known) return undefined;
    const from = VersionVector.parseJSON(version.toJSON());
    if (known === 0) from.remove(peer);
    else from.setEnd({ peer, counter: known });
    return from;
  };

  return {
    encode: () => doc.export({ mode: "snapshot" }),

    apply: (update) => {
      // Report pending local edits before the import, which would commit them silently.
      doc.commit();
      importing = update;
      try {
        doc.import(update);
      } finally {
        importing = undefined;
      }
    },

    subscribe: (onUpdate): Unsubscribe => {
      let saved = doc.oplogVersion();
      return doc.subscribe(({ by }) => {
        const version = doc.oplogVersion();
        if (version.compare(saved) === 0) return;
        // Skip the update `apply` imports, but not what was committed in response, which a
        // later change of this document depends on.
        const from =
          importing !== undefined && by === "import"
            ? committedSince(saved, version, importing)
            : saved;
        saved = version;
        if (from !== undefined) onUpdate(doc.export({ mode: "update", from }));
      });
    },
  };
};
