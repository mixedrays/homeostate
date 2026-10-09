import type { PersistenceAdapter, StoredUpdates } from "@homeostate/core";
import { fromBase64, toBase64 } from "./base64.js";

export interface LocalStorageAdapterOptions {
  /** Prepended to every key, so documents stay apart from other data; defaults to `'homeostate:'`. */
  prefix?: string;
  /**
   * Storage to write to; defaults to `localStorage`, read when first used. Pass
   * `sessionStorage` to keep documents for the tab's session only.
   */
  storage?: Storage;
}

/** One document's log: its updates in base64, each with its version. */
interface Log {
  next: number;
  updates: [version: number, update: string][];
}

/**
 * `PersistenceAdapter` over the Web Storage API. Each document is one JSON entry, rewritten
 * on every update, and base64 grows it by a third; that suits small documents. Browsers
 * allow about 5 MB per origin, and a write past that fails and is reported through
 * `createPersistence`'s `onError`. Prefer `@homeostate/persist-indexeddb` for larger ones.
 *
 * @example
 * ```typescript
 * createPersistence(createYjsPersistable(doc), createLocalStorageAdapter(), { key: 'todos' });
 * ```
 */
export const createLocalStorageAdapter = (
  options: LocalStorageAdapterOptions = {},
): PersistenceAdapter => {
  const { prefix = "homeostate:" } = options;
  const storage = (): Storage => options.storage ?? localStorage;

  const read = (key: string): Log => {
    const text = storage().getItem(prefix + key);
    return text === null ? { next: 1, updates: [] } : (JSON.parse(text) as Log);
  };

  const write = (key: string, log: Log): void => {
    storage().setItem(prefix + key, JSON.stringify(log));
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

    append: async (key, update) => {
      write(key, add(read(key), update));
    },

    compact: async (key, snapshot, version) => {
      const log = read(key);
      const kept = log.updates.filter(([entry]) => entry > version);
      write(key, add({ next: log.next, updates: kept }, snapshot));
    },

    clear: async (key) => {
      storage().removeItem(prefix + key);
    },
  };
};
