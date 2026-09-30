import * as Y from "yjs";
import type { PersistableDoc, Unsubscribe } from "@homeostate/core";

/**
 * Exposes a whole Y.Doc to `createPersistence` as Yjs updates, so every shared type in it
 * is stored, not only the map a backend syncs.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const persistence = createPersistence(createYjsPersistable(doc), adapter, { key: 'room' });
 * ```
 */
export const createYjsPersistable = (doc: Y.Doc): PersistableDoc => {
  const origin = Symbol("homeostate:persistence");

  return {
    encode: () => Y.encodeStateAsUpdate(doc),

    apply: (update) => Y.applyUpdate(doc, update, origin),

    subscribe: (onUpdate): Unsubscribe => {
      const handler = (update: Uint8Array, updateOrigin: unknown): void => {
        if (updateOrigin !== origin) onUpdate(update);
      };
      doc.on("update", handler);
      return () => doc.off("update", handler);
    },
  };
};
