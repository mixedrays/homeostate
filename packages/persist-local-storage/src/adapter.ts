import type { PersistenceAdapter, StoredUpdates } from "@homeostate/core";
import { fromBase64, toBase64 } from "./base64.js";

/**
 * How writes to one entry are kept from overwriting each other's.
 * - `'locks'`: each append, compaction and clear holds a Web Lock named after the entry, so
 *   tabs and windows of the origin take turns, and none rewrites a log another one changed
 *   after its read. Needs `navigator.locks`, which browsers provide in secure contexts only.
 * - `'single-writer'`: no coordination. Safe only while one tab writes the entry, such as
 *   with `sessionStorage`; two tabs writing it at once can lose each other's updates.
 */
export type LocalStorageCoordination = "locks" | "single-writer";

export interface LocalStorageAdapterOptions {
  /** Prepended to every key, so documents stay apart from other data; defaults to `'homeostate:'`. */
  prefix?: string;
  /**
   * Storage to write to; defaults to `localStorage`, read when first used. Pass
   * `sessionStorage` to keep documents for the tab's session only.
   */
  storage?: Storage;
  /**
   * How writers of the same entry in other tabs are coordinated; defaults to `'locks'`. Without
   * `navigator.locks`, as on a page served over plain http from another host than localhost,
   * `'locks'` makes every append, compaction and clear reject; pass `'single-writer'` when only
   * one tab writes the storage. See `LocalStorageCoordination`.
   */
  coordination?: LocalStorageCoordination;
}

/** Prepended to `prefix` and the key to name the lock that writers of that entry share. */
const LOCK_PREFIX = "@homeostate/persist-local-storage:";

/** One document's log: its updates in base64, each with its version. */
interface Log {
  next: number;
  updates: [version: number, update: string][];
}

const webLocks = (): LockManager | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.locks;

/**
 * `PersistenceAdapter` over the Web Storage API. Each document is one JSON entry, rewritten
 * on every update, and base64 grows it by a third; that suits small documents. Browsers
 * allow about 5 MB per origin, and a write past that fails and is reported through
 * `createPersistence`'s `onError`. Prefer `@homeostate/persist-indexeddb` for larger ones.
 *
 * Every append, compaction and clear holds a Web Lock named
 * `@homeostate/persist-local-storage:<prefix><key>` while it reads and rewrites the entry, so
 * tabs persisting the same key do not overwrite each other's updates. Without the Web Locks API
 * those calls reject, unless `coordination` is `'single-writer'`. `load` takes no lock.
 *
 * @example
 * ```typescript
 * createPersistence(createYjsPersistable(doc), createLocalStorageAdapter(), { key: 'todos' });
 * ```
 */
export const createLocalStorageAdapter = (
  options: LocalStorageAdapterOptions = {},
): PersistenceAdapter => {
  const { prefix = "homeostate:", coordination = "locks" } = options;
  const storage = (): Storage => options.storage ?? localStorage;

  const read = (key: string): Log => {
    const text = storage().getItem(prefix + key);
    return text === null ? { next: 1, updates: [] } : (JSON.parse(text) as Log);
  };

  const write = (key: string, log: Log): void => {
    storage().setItem(prefix + key, JSON.stringify(log));
  };

  /**
   * Runs a read-modify-write of `key`, with `'locks'` while holding the entry's lock, so no
   * other tab writes it meanwhile. The lock's callback is async so that a throw releases the
   * lock: Node keeps it after a synchronous throw.
   */
  const mutate = async (key: string, run: () => void): Promise<void> => {
    if (coordination === "single-writer") return run();
    const locks = webLocks();
    if (!locks)
      throw new Error(
        `@homeostate/persist-local-storage: the Web Locks API (navigator.locks) is unavailable, ` +
          `so writes to "${prefix}${key}" cannot be coordinated with other tabs. Browsers ` +
          `provide it in secure contexts, such as https and localhost. Pass ` +
          `coordination: "single-writer" when only one tab writes this storage.`,
      );
    return locks.request(LOCK_PREFIX + prefix + key, async () => run());
  };

  const add = (log: Log, update: Uint8Array): Log => ({
    next: log.next + 1,
    updates: [...log.updates, [log.next, toBase64(update)]],
  });

  return {
    load: async (key): Promise<StoredUpdates> => {
      const { updates } = read(key);
      return {
        updates: updates.map(([, update]) => fromBase64(update)),
        version: updates.length > 0 ? updates[updates.length - 1][0] : 0,
      };
    },

    append: (key, update) =>
      mutate(key, () => write(key, add(read(key), update))),

    compact: (key, snapshot, version) =>
      mutate(key, () => {
        const log = read(key);
        const kept = log.updates.filter(([entry]) => entry > version);
        write(key, add({ next: log.next, updates: kept }, snapshot));
      }),

    clear: (key) => mutate(key, () => storage().removeItem(prefix + key)),
  };
};
