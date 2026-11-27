import * as Y from "yjs";
import type { PersistableDoc, Unsubscribe } from "@homeostate/core";

/**
 * What a document holds but cannot integrate yet, in Yjs's V2 update format: structs that wait
 * for an earlier update, and deletes that wait for their targets. `pendingStructs` and
 * `pendingDs` are in Yjs's typings but undocumented.
 */
type Pending = [structs: Uint8Array | null, deletes: Uint8Array | null];

const pendingOf = (doc: Y.Doc): Pending => [
  doc.store.pendingStructs?.update ?? null,
  doc.store.pendingDs,
];

const sameBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every((byte, i) => byte === b[i]));

/**
 * Exposes a whole Y.Doc to `createPersistence` as Yjs updates, so every shared type in it
 * is stored, not only the map a backend syncs.
 *
 * `subscribe` reports what the document holds but cannot integrate yet, too. A transaction's
 * `update` event lacks it: an update that arrives before one it depends on reports its deletes
 * but not the structs that replace what they delete. So when a transaction changes what waits,
 * its update also carries all that waits, as `encode()` does, and a transaction that changes
 * only what waits reports that alone. What still waits unchanged is not reported again.
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
      // Pending state already reported, held when subscribing, or restored by `apply`.
      let seen = pendingOf(doc);

      /** The parts of the pending state that changed since `seen`, in the V1 format. */
      const changed = (): Uint8Array[] => {
        const now = pendingOf(doc);
        const parts = now.filter(
          (part, i): part is Uint8Array =>
            part !== null && !sameBytes(part, seen[i]),
        );
        seen = now;
        return parts.map((part) => Y.convertUpdateFormatV2ToV1(part));
      };

      const handleUpdate = (
        update: Uint8Array,
        updateOrigin: unknown,
      ): void => {
        const pending = changed();
        if (updateOrigin === origin) return;
        onUpdate(
          pending.length > 0 ? Y.mergeUpdates([update, ...pending]) : update,
        );
      };

      // After every `update` event, for a transaction that changed only the pending state, as
      // one whose update waits whole, and so emitted none.
      const handleTransactions = (
        _doc: Y.Doc,
        transactions: Y.Transaction[],
      ): void => {
        const pending = changed();
        if (
          pending.length > 0 &&
          transactions.some((transaction) => transaction.origin !== origin)
        )
          onUpdate(pending.length > 1 ? Y.mergeUpdates(pending) : pending[0]);
      };

      doc.on("update", handleUpdate);
      doc.on("afterAllTransactions", handleTransactions);
      return () => {
        doc.off("update", handleUpdate);
        doc.off("afterAllTransactions", handleTransactions);
      };
    },
  };
};
