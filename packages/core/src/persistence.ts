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

  const applyStored = (updates: Uint8Array[]): void => {
    for (const update of updates) {
      try {
        doc.apply(update);
      } catch (error) {
        onError(error);
      }
    }
  };

  /** Merge the stored log into the document, then replace the log with its snapshot. */
  const compact = async (onApplied?: () => void): Promise<void> => {
    const { updates, version } = await adapter.load(key);
    applyStored(updates);
    onApplied?.();
    appended = 0;
    await adapter.compact(key, doc.encode(), version);
  };

  // Subscribe before loading, so no update made in the meantime is missed.
  const unsubscribe = doc.subscribe((update) => {
    if (stopped) return;
    void enqueue(async () => {
      await adapter.append(key, update);
      if (++appended >= compactAfter) await compact();
    });
  });

  let markLoaded!: () => void;
  const whenLoaded = new Promise<void>((resolve) => {
    markLoaded = resolve;
  });
  // The first compaction also stores whatever the document held before it was persisted.
  void enqueue(() => compact(markLoaded)).finally(markLoaded);

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
  };

  return {
    whenLoaded,

    flush: () => queue,

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
