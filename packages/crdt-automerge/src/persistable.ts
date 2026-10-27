import * as A from "@automerge/automerge";
import type { PersistableDoc, Unsubscribe } from "@homeostate/core";
import type { AutomergeHandle } from "./handle.js";

const sameHeads = (a: A.Heads, b: A.Heads): boolean =>
  a.length === b.length && a.every((hash, i) => hash === b[i]);

/**
 * Exposes the document behind an AutomergeHandle to `createPersistence`: `encode` saves the
 * whole document, and each change to the handle is reported as the changes since the last.
 */
export const createAutomergePersistable = <T>(
  handle: AutomergeHandle<T>,
): PersistableDoc => {
  /** The heads each subscription has reported up to. */
  const subscriptions = new Set<{ heads: A.Heads }>();

  return {
    encode: () => A.save(handle.doc()),

    apply: (update) => {
      let changed = false;
      handle.update((doc) => {
        const next = A.loadIncremental(doc, update);
        // Skip the update itself, but not what the handle's listeners change in response,
        // which a later change of this document depends on.
        const before = A.getHeads(doc);
        const after = A.getHeads(next);
        changed = !sameHeads(before, after);
        for (const subscription of subscriptions)
          if (sameHeads(subscription.heads, before)) subscription.heads = after;
        return next;
      });
      // Once the document holds changes, `loadIncremental` skips bytes it cannot read, such
      // as another library's update. Throw for those, so `createPersistence` keeps them; a
      // repeated update, or one waiting for an earlier change, still loads.
      if (!changed) A.load(update, { allowMissingChanges: true });
    },

    subscribe: (onUpdate): Unsubscribe => {
      const subscription = { heads: A.getHeads(handle.doc()) };
      subscriptions.add(subscription);
      // The current document, not the event's: a listener that changes the document while an
      // event is delivered notifies every listener of its change before the rest get the event.
      const unsubscribe = handle.subscribe(() => {
        const doc = handle.doc();
        const heads = A.getHeads(doc);
        if (sameHeads(subscription.heads, heads)) return;
        const since = subscription.heads;
        subscription.heads = heads;
        onUpdate(A.saveSince(doc, since));
      });
      return () => {
        subscriptions.delete(subscription);
        unsubscribe();
      };
    },
  };
};
