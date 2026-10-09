import type { PersistenceAdapter, StoredUpdates } from "@homeostate/core";

export interface IndexedDbAdapterOptions {
  /** Name of the database; defaults to `'homeostate'`. */
  name?: string;
  /** IndexedDB implementation; defaults to the global `indexedDB`, read when first used. */
  indexedDB?: IDBFactory;
}

export interface IndexedDbAdapter extends PersistenceAdapter {
  /** Close the database connection; the next call opens it again. */
  close: () => void;
}

const STORE = "updates";
const BY_KEY = "key";

/** A stored update; the auto-incremented primary key is its version. */
interface Row {
  key: string;
  update: Uint8Array;
}

/** A view on part of a buffer would store the whole buffer. */
const exact = (bytes: Uint8Array): Uint8Array =>
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : bytes.slice();

const completion = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
  });

/** Visit every row stored under `key`, oldest first. */
const eachRow = (
  store: IDBObjectStore,
  key: string,
  visit: (cursor: IDBCursorWithValue) => void,
): void => {
  const request = store.index(BY_KEY).openCursor(key);
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor === null) return;
    visit(cursor);
    cursor.continue();
  };
};

/**
 * `PersistenceAdapter` over IndexedDB. Every update is one row, so appending stays cheap
 * however large the document grows, and each operation is one transaction, which keeps
 * compaction safe across tabs.
 *
 * @example
 * ```typescript
 * createPersistence(createYjsPersistable(doc), createIndexedDbAdapter(), { key: 'todos' });
 * ```
 */
export const createIndexedDbAdapter = (
  options: IndexedDbAdapterOptions = {},
): IndexedDbAdapter => {
  const { name = "homeostate" } = options;
  let database: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = (options.indexedDB ?? indexedDB).open(name, 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore(STORE, { autoIncrement: true })
          .createIndex(BY_KEY, "key");
      };
      request.onsuccess = () => {
        const db = request.result;
        // Let another tab upgrade or delete the database.
        db.onversionchange = () => {
          db.close();
          database = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });

  const connection = (): Promise<IDBDatabase> => {
    if (database === null) {
      database = open().catch((error: unknown) => {
        database = null;
        throw error;
      });
    }
    return database;
  };

  /** Run `work` in one transaction, issuing every request before the first await. */
  const transact = async (
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => void,
  ): Promise<void> => {
    const tx = (await connection()).transaction(STORE, mode);
    work(tx.objectStore(STORE));
    await completion(tx);
  };

  return {
    load: async (key): Promise<StoredUpdates> => {
      const updates: Uint8Array[] = [];
      let version = 0;
      await transact("readonly", (store) =>
        eachRow(store, key, (cursor) => {
          updates.push((cursor.value as Row).update);
          version = cursor.primaryKey as number;
        }),
      );
      return { updates, version };
    },

    append: (key, update) =>
      transact("readwrite", (store) => {
        store.add({ key, update: exact(update) } satisfies Row);
      }),

    compact: (key, snapshot, version) =>
      transact("readwrite", (store) => {
        // The snapshot's version is above `version`, so the loop below keeps it.
        store.add({ key, update: exact(snapshot) } satisfies Row);
        eachRow(store, key, (cursor) => {
          if ((cursor.primaryKey as number) <= version) cursor.delete();
        });
      }),

    clear: (key) =>
      transact("readwrite", (store) =>
        eachRow(store, key, (cursor) => {
          cursor.delete();
        }),
      ),

    close: () => {
      const current = database;
      database = null;
      void current?.then((db) => db.close()).catch(() => {});
    },
  };
};
