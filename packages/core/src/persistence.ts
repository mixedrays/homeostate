import type {
  Persistence,
  PersistableDoc,
  PersistenceAdapter,
  PersistenceConfig,
} from "./types.js";

const reportError = (error: unknown): void => {
  console.error("[homeostate] persistence failed:", error);
};

/**
 * Keeps a CRDT document in a `PersistenceAdapter`, so its state outlives every peer and
 * the sync server: restore it on start, then store every update the document makes or
 * receives.
 *
 * Stored updates are applied to the document asynchronously; connect the sync engine
 * after `whenLoaded`, so `connect()` sees the restored keys instead of seeding the store's
 * defaults over them. The provider can connect at any time.
 *
 * Updates are appended one by one, and every `compactAfter` appends the stored log is
 * merged into a single snapshot. Several documents may share one key, in one tab or
 * across tabs: compaction only removes updates it has applied to its own document first.
 * When a stored update cannot be applied, the log is not compacted, so its bytes stay
 * available for recovery until `clear()`.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const persistence = createPersistence(
 *   createYjsPersistable(doc),
 *   createIndexedDbAdapter(),
 *   { key: 'todos' },
 * );
 * new WebsocketProvider(url, 'todos', doc);
 * await persistence.whenLoaded;
 * createSyncEngine(createYjsBackend(doc, 'shared'), adapter).connect();
 * ```
 */
export function createPersistence(
  doc: PersistableDoc,
  adapter: PersistenceAdapter,
  config: PersistenceConfig,
): Persistence {
  const { key, compactAfter = 100, onError = reportError } = config;

  let stopped = false;
  let appended = 0;
  let queue: Promise<void> = Promise.resolve();

  /** Storage calls run one at a time, in order; a failure is reported and skipped. */
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch(onError);
    return queue;
  };

  /** Apply every stored update it can; false when one of them could not be applied. */
  const applyStored = (updates: Uint8Array[]): boolean => {
    let complete = true;
    for (const update of updates) {
      try {
        doc.apply(update);
      } catch (error) {
        complete = false;
        onError(error);
      }
    }
    return complete;
  };

  let markLoaded!: () => void;
  const whenLoaded = new Promise<void>((resolve) => {
    markLoaded = resolve;
  });

  /**
   * Merge the stored log into the document, then replace the log with its snapshot. A log
   * holding an update the document could not apply is kept as it is, since the snapshot
   * would not contain that update.
   */
  const compact = async (initial = false): Promise<void> => {
    const { updates, version } = await adapter.load(key);
    const complete = applyStored(updates);
    if (initial) markLoaded();
    appended = 0;
    // The first snapshot also stores whatever the document held before it was persisted, so
    // a first load that keeps the log appends it instead.
    if (complete) await adapter.compact(key, doc.encode(), version);
    else if (initial) await adapter.append(key, doc.encode());
  };

  // Subscribe before loading, so no update made in the meantime is missed.
  const unsubscribe = doc.subscribe((update) => {
    if (stopped) return;
    void enqueue(async () => {
      await adapter.append(key, update);
      if (++appended >= compactAfter) await compact();
    });
  });

  void enqueue(() => compact(true)).finally(markLoaded);

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
  };

  return {
    whenLoaded,

    flush: () => queue,

    compact: () => (stopped ? queue : enqueue(() => compact())),

    stats: async () => {
      await queue;
      const { updates } = await adapter.load(key);
      return {
        updates: updates.length,
        bytes: updates.reduce((total, update) => total + update.byteLength, 0),
      };
    },

    destroy: () => {
      stop();
      return queue;
    },

    clear: () => {
      stop();
      return enqueue(() => adapter.clear(key));
    },
  };
}
