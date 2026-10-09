import type { PersistenceAdapter, StoredUpdates } from "./types.js";

export interface MemoryPersistenceAdapter extends PersistenceAdapter {
  /** Number of updates stored under `key`, snapshots included */
  size: (key: string) => number;
}

/**
 * In-memory `PersistenceAdapter`, as if every page shared one storage. It gives tests a
 * fast storage that outlives the documents written to it.
 */
export const createMemoryPersistenceAdapter = (): MemoryPersistenceAdapter => {
  const logs = new Map<string, [version: number, update: Uint8Array][]>();
  let next = 1;

  const log = (key: string) => logs.get(key) ?? [];

  return {
    load: async (key): Promise<StoredUpdates> => {
      const entries = log(key);
      return {
        updates: entries.map(([, update]) => update.slice()),
        version: entries.length > 0 ? entries[entries.length - 1][0] : 0,
      };
    },

    append: async (key, update) => {
      logs.set(key, [...log(key), [next++, update.slice()]]);
    },

    compact: async (key, snapshot, version) => {
      const kept = log(key).filter(([entry]) => entry > version);
      logs.set(key, [...kept, [next++, snapshot.slice()]]);
    },

    clear: async (key) => {
      logs.delete(key);
    },

    size: (key) => log(key).length,
  };
};
