import type {
  Persistence,
  PersistableDoc,
  PersistenceAdapter,
  PersistenceConfig,
  PersistenceLoadResult,
} from "./types.js";

const reportError = (error: unknown): void => {
  console.error("[homeostate] persistence failed:", error);
};

const ignore = (): void => {};

/**
 * Mark a promise returned to the caller as handled: its failure has gone to `onError`, so a
 * caller that does not await it gets no unhandled rejection. Awaiting it still rejects.
 */
const handled = <T>(promise: Promise<T>): Promise<T> => {
  promise.catch(ignore);
  return promise;
};

/**
 * Keeps a CRDT document in a `PersistenceAdapter`, so its state outlives every peer and
 * the sync server: restore it on start, then store every update the document makes or
 * receives.
 *
 * Stored updates are applied to the document asynchronously; connect the sync engine
 * after `whenLoaded`, so `connect()` sees the restored keys instead of seeding the store's
 * defaults over them. It resolves with a `PersistenceLoadResult`, which tells a first start
 * from a restored document, and both from a log that could not be read or applied in full.
 * The provider can connect at any time.
 *
 * Updates are appended one by one, and every `compactAfter` appends the stored log is
 * merged into a single snapshot. Several documents may share one key, in one tab or
 * across tabs: compaction only removes updates it has applied to its own document first.
 * When a stored update cannot be applied, the log is not compacted, so its bytes stay
 * available for recovery until `clear()`.
 *
 * Every failure goes to `onError` once, and the queue moves on. `compact()` and `clear()`
 * reject with their own storage error; `flush()` and `destroy()` reject while an update the
 * document reported may be missing from storage, until a snapshot or `clear()` succeeds.
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
 * const loaded = await persistence.whenLoaded;
 * if (loaded.status === 'empty' || loaded.status === 'loaded') {
 *   createSyncEngine(createYjsBackend(doc, 'shared'), adapter).connect();
 * } else {
 *   showRecovery(loaded);
 * }
 * ```
 */
export function createPersistence(
  doc: PersistableDoc,
  adapter: PersistenceAdapter,
  config: PersistenceConfig,
): Persistence {
  const { key, compactAfter = 100, onError = reportError } = config;

  /** Report to `onError`, which only observes: what it throws is logged, not passed on. */
  const report = (error: unknown): void => {
    try {
      onError(error);
    } catch (thrown) {
      console.error("[homeostate] persistence onError threw:", thrown);
    }
  };

  let stopped = false;
  let appended = 0;
  let queue: Promise<void> = Promise.resolve();
  /**
   * The earliest write failure storage may still be missing the document's content for, until
   * a full snapshot or `clear()` succeeds; barriers reject with its error until then.
   */
  let unresolved: { error: unknown } | undefined;

  const unstored = (error: unknown): never => {
    unresolved ??= { error };
    throw error;
  };

  /**
   * Storage calls run one at a time, in order. The returned promise settles as the task does;
   * the queue reports a failure and moves on.
   */
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const run = queue.then(task);
    queue = run.catch(report);
    return run;
  };

  /** Apply every stored update it can; returns what applying the others threw, in log order. */
  const applyStored = (updates: Uint8Array[]): unknown[] => {
    const errors: unknown[] = [];
    for (const update of updates) {
      try {
        doc.apply(update);
      } catch (error) {
        errors.push(error);
        report(error);
      }
    }
    return errors;
  };

  let markLoaded!: (result: PersistenceLoadResult) => void;
  const whenLoaded = new Promise<PersistenceLoadResult>((resolve) => {
    markLoaded = resolve;
  });

  /**
   * Merge the stored log into the document, then replace the log with its snapshot. A log
   * holding an update the document could not apply is kept as it is, since the snapshot
   * would not contain that update.
   */
  const compact = async (initial = false): Promise<void> => {
    const { updates, version } = await adapter.load(key);
    const errors = applyStored(updates);
    const complete = errors.length === 0;
    if (initial)
      markLoaded(
        updates.length === 0
          ? { status: "empty" }
          : complete
            ? { status: "loaded" }
            : { status: "partial", errors },
      );
    appended = 0;
    // The first snapshot also stores whatever the document held before it was persisted, so
    // a first load that keeps the log appends it instead.
    if (complete) await adapter.compact(key, doc.encode(), version);
    else if (initial) await adapter.append(key, doc.encode());
    else return;
    // The snapshot holds everything the document reported before it, failed writes included.
    unresolved = undefined;
  };

  // Subscribe before loading, so no update made in the meantime is missed.
  const unsubscribe = doc.subscribe((update) => {
    if (stopped) return;
    void enqueue(async () => {
      await adapter.append(key, update).catch(unstored);
      if (++appended >= compactAfter) await compact();
    });
  });

  // Until the first snapshot is written, storage may lack what the document held before.
  const initialLoad = enqueue(() => compact(true).catch(unstored));
  // Only reading the log can fail before `whenLoaded` resolves, and the queue reports that to
  // `onError` first. A failed initial snapshot rejects too, once `whenLoaded` has resolved, so
  // it leaves the result as it was.
  void initialLoad.catch((error: unknown) => {
    markLoaded({ status: "failed", error });
  });

  /** Wait for the work queued so far, then reject while a write failure is unresolved. */
  const barrier = (): Promise<void> =>
    queue.then(() => {
      if (unresolved) throw unresolved.error;
    });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
  };

  return {
    whenLoaded,

    flush: () => handled(barrier()),

    compact: () => (stopped ? queue : handled(enqueue(() => compact()))),

    stats: () =>
      handled(
        queue.then(async () => {
          const { updates } = await adapter.load(key);
          return {
            updates: updates.length,
            bytes: updates.reduce(
              (total, update) => total + update.byteLength,
              0,
            ),
          };
        }),
      ),

    destroy: () => {
      stop();
      return handled(barrier());
    },

    clear: () => {
      stop();
      return handled(
        enqueue(async () => {
          await adapter.clear(key);
          unresolved = undefined;
        }),
      );
    },
  };
}
