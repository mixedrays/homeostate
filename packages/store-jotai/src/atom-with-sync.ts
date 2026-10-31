import { atom, type WritableAtom } from "jotai/vanilla";
import {
  createSyncEngine,
  type JsonObject,
  type SetupOptions,
  type SyncEngine,
  type SyncEngineConfig,
} from "@homeostate/core";
import {
  createJotaiAdapter,
  type JotaiStore,
  type SyncedAtom,
} from "./adapter.js";
import {
  combineAtoms,
  isAtom,
  type AnyAtoms,
  type SyncedAtoms,
  type SyncedAtomsState,
} from "./atoms.js";

type OmitConnect<O> = O extends unknown ? Omit<O, "connect"> : never;

/**
 * The options of `atomWithSync` for a state `S`: the backend and the sync engine's config, whose
 * `filter`, `keys` and `omit` are typed by `S`. They have no `connect` mode: the atom connects
 * when it is mounted.
 */
export type AtomWithSyncOptions<S extends object = JsonObject> = OmitConnect<
  SetupOptions<S>
>;

/** What one `atomWithSync` atom keeps per Jotai store. */
interface StoreSlot {
  store?: JotaiStore;
  engine?: SyncEngine;
}

/** The hook that hands a new atom its store; Jotai 2.16 renamed it, and 2.17 dropped the old name. */
interface StoreHooks {
  INTERNAL_onInit?: (store: JotaiStore) => void;
  unstable_onInit?: (store: JotaiStore) => void;
}

/** Written to the atom on mount, where only a write can reach the store. Its result is the slot. */
const READ_SLOT = Symbol("homeostate:read-slot");

const NO_STORE_MESSAGE =
  "[homeostate] The installed Jotai did not give atomWithSync its store, so the atom cannot " +
  "sync. atomWithSync needs Jotai 2.12 or later.";

const SECOND_STORE_MESSAGE =
  "[homeostate] This atomWithSync atom is already syncing in another Jotai store. It syncs one " +
  "store at a time, because a backend skips its own writes for every subscriber, so stores " +
  "sharing one would not hear each other. To sync two stores at once, call atomWithSync once " +
  "per store, each with its own backend on the same document.";

/**
 * Ties a writable atom's sync to Jotai's mounting: connects when the returned atom is first
 * mounted in a store, and disconnects when its last subscriber unmounts. Reading and writing the
 * returned atom behave like `target`. Needs Jotai 2.12 or later.
 *
 * Only mounting the returned atom, or an atom derived from it, starts sync. Mounting `target`
 * does not, so components must read the returned atom, or one that does must stay mounted.
 *
 * The atom syncs one store at a time, with one engine per store, and mounting it in a second
 * store while the first is mounted throws. Stores mounted one after another each sync. To sync
 * two stores at once, call `atomWithSync` once per store, each with its own backend on the same
 * document.
 *
 * Each mount is a reconnect: it adopts the backend, so edits made while unmounted are dropped
 * for every key the backend holds. If connecting throws, the error reaches whoever mounted the
 * atom, and that store stays unsynced until it is discarded.
 *
 * @param target - Writable atom holding the synced state
 * @param options - The `backend`, any `CrdtBackend` such as `@homeostate/crdt-yjs`, and the sync
 * engine's config (`filter`, `keys`, `omit`, `seed`, `schedule`, `onError`)
 * @returns An atom that reads and writes `target` and syncs while it is mounted
 *
 * @example
 * ```typescript
 * import * as Y from 'yjs';
 * import { atom } from 'jotai';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const counterAtom = atomWithSync(atom({ count: 0 }), {
 *   backend: createYjsBackend(new Y.Doc(), 'shared'),
 * });
 * ```
 */
export function atomWithSync<S extends object, Args extends unknown[], Result>(
  target: WritableAtom<S, Args, Result> & SyncedAtom<NoInfer<S>>,
  options: NoInfer<AtomWithSyncOptions<S>>,
): WritableAtom<S, Args, Result>;

/**
 * Ties the sync of a record of writable atoms to Jotai's mounting, as one state with one
 * top-level key per atom, typed from the atoms. See `createJotaiAdapter` for how a record syncs.
 *
 * Only mounting the returned atom, or an atom derived from it, starts sync. Reading a record's
 * atom does not, so mount the returned atom where components read the record's atoms directly.
 *
 * Every peer sharing a room should sync the same set of atoms: a key the backend holds that the
 * record does not list is removed by the next write, even with the `keys` option.
 *
 * If connecting throws, the error reaches whoever mounted the atom, and that store stays unsynced
 * until it is discarded.
 *
 * @param atoms - Record of writable atoms, keyed by the synced key each one holds
 * @param options - The `backend` and the sync engine's config
 * @returns An atom holding every atom's value under its key, which syncs while it is mounted
 *
 * @example
 * ```typescript
 * const syncedAtom = atomWithSync(
 *   { todos: todosAtom, filter: filterAtom },
 *   { backend: createYjsBackend(new Y.Doc(), 'shared') },
 * );
 * ```
 */
export function atomWithSync<R extends SyncedAtoms<R>>(
  atoms: R,
  options: NoInfer<AtomWithSyncOptions<SyncedAtomsState<R>>>,
): SyncedAtom<SyncedAtomsState<R>>;

export function atomWithSync(
  target: SyncedAtom<object> | AnyAtoms,
  options: AtomWithSyncOptions<never>,
): WritableAtom<object, never[], unknown> {
  const { backend, ...config } = options;
  const root = (isAtom(target) ? target : combineAtoms(target)) as WritableAtom<
    object,
    unknown[],
    unknown
  >;

  // An atom with no dependencies, read once per store, so its value is per store.
  const slotAtom = atom((): StoreSlot => ({}));
  slotAtom.debugPrivate = true;

  /**
   * The engine of the store mounted last. Connected is what holds other stores off: Jotai runs
   * no cleanup after `onMount` throws, so a failed `connect()` must leave nothing to release.
   */
  let current: SyncEngine | undefined;

  const syncedAtom: WritableAtom<object, unknown[], unknown> = atom(
    (get) => get(root),
    (get, set, ...args) =>
      args[0] === READ_SLOT ? get(slotAtom) : set(root, ...args),
  );

  // `onMount` is not told its store, and the sync engine must subscribe to it: a record's atoms
  // are written directly, not through this atom. So the store is kept when it first meets the atom.
  const keepStore = (store: JotaiStore): void => {
    store.get(slotAtom).store = store;
  };
  (syncedAtom as StoreHooks).INTERNAL_onInit = keepStore;
  (syncedAtom as StoreHooks).unstable_onInit = keepStore;

  syncedAtom.onMount = (setAtom) => {
    const slot = setAtom(READ_SLOT) as StoreSlot;
    if (slot.store === undefined) throw new Error(NO_STORE_MESSAGE);
    if (current?.isConnected() === true) {
      throw new Error(SECOND_STORE_MESSAGE);
    }
    slot.engine ??= createSyncEngine(
      backend,
      createJotaiAdapter(root, slot.store),
      config as SyncEngineConfig<object>,
    );
    const { engine } = slot;
    current = engine;
    engine.connect();
    return () => engine.disconnect();
  };

  return syncedAtom;
}
