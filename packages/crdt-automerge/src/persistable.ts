import * as A from "@automerge/automerge";
import type { PersistableDoc, Unsubscribe } from "@homeostate/core";
import type { AutomergeHandle } from "./handle.js";

/**
 * Exposes the document behind an AutomergeHandle to `createPersistence`: `encode` saves the
 * whole document, and each change to the handle is reported as the changes since the last.
 */
export const createAutomergePersistable = <T>(
  handle: AutomergeHandle<T>,
): PersistableDoc => {
  let applying = false;

  return {
    encode: () => A.save(handle.doc()),

    apply: (update) => {
      applying = true;
      try {
        handle.update((doc) => A.loadIncremental(doc, update));
      } finally {
        applying = false;
      }
    },

    subscribe: (onUpdate): Unsubscribe => {
      let heads = A.getHeads(handle.doc());
      return handle.subscribe(({ doc }) => {
        const since = heads;
        heads = A.getHeads(doc);
        if (!applying) onUpdate(A.saveSince(doc, since));
      });
    },
  };
};
