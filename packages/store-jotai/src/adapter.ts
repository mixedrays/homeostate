import {
  getDefaultStore,
  type WritableAtom,
  type createStore,
} from "jotai/vanilla";
import type { StoreAdapter, Unsubscribe } from "@homeostate/core";
import {
  combineAtoms,
  type AnyAtoms,
  type SyncedAtoms,
  type SyncedAtomsState,
} from "./atoms.js";

export type JotaiStore = ReturnType<typeof createStore>;

/** A writable atom that holds the whole synced state and accepts a full replacement */
export type SyncedAtom<S> = WritableAtom<S, [S], unknown>;

class JotaiAdapter<S extends object> implements StoreAdapter<S> {
  private atom: SyncedAtom<S>;
  private store: JotaiStore;

  /**
   * Create a Jotai adapter
   * @param atom - Writable atom holding the synced state
   * @param store - Jotai store the atom lives in; defaults to the global default store
   */
  constructor(atom: SyncedAtom<S>, store: JotaiStore = getDefaultStore()) {
    this.atom = atom;
    this.store = store;
  }

  getState(): S {
    return this.store.get(this.atom);
  }

  setState(state: S): void {
    this.store.set(this.atom, state);
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return this.store.sub(this.atom, onStoreChange);
  }
}

/**
 * Creates a Jotai-specific store adapter that syncs one writable atom with the sync engine.
 * Pass a primitive atom, or a derived writable atom that fans a replacement out
 * to several atoms to sync a slice spread across the atom graph. To sync several atoms
 * without writing that root atom, pass a record of atoms instead.
 *
 * @param atom - Writable atom holding the synced state
 * @param store - Jotai store the atom lives in; defaults to the global default store
 * @returns StoreAdapter instance for the atom
 *
 * @example
 * ```typescript
 * import { atom, createStore } from 'jotai';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const counterAtom = atom({ count: 0 });
 * const store = createStore();
 * const adapter = createJotaiAdapter(counterAtom, store);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export function createJotaiAdapter<S extends object>(
  atom: SyncedAtom<S>,
  store?: JotaiStore,
): StoreAdapter<S>;

/**
 * Creates a Jotai-specific store adapter that syncs a record of writable atoms as one state,
 * one top-level key per atom, typed from the atoms' values. Each atom must accept a full
 * replacement of its value, as primitive, `atomWithReset` and `atomWithStorage` atoms do.
 *
 * A remote change sets every atom it changes in one `store.set`, so subscribers to the state
 * hear one notification, and atoms it does not change keep their value and are not written.
 *
 * An `undefined` value is an absent key. When a peer removes a key, its atom is reset to its
 * initial value (`init`), and the sync engine writes that value back, as it writes anything the
 * store normalises, so the key returns on every peer. An atom without an initial value, such as
 * a derived writable atom, keeps its value instead, which is written back the same way. Only an
 * atom whose initial value is `undefined` keeps the key absent. So setting an atom with another
 * initial value to `undefined` resets it to that value on every peer, this one included.
 *
 * The record's keys are the whole synced state: a key the backend holds that the record does
 * not list is removed by the next write, as with any store adapter. Passing the sync engine's
 * `keys` option does not prevent this, so every peer sharing a room should sync the same set of
 * atoms.
 *
 * @param atoms - Record of writable atoms, keyed by the synced key each one holds
 * @param store - Jotai store the atoms live in; defaults to the global default store
 * @returns StoreAdapter instance for the atoms
 *
 * @example
 * ```typescript
 * const todosAtom = atom<Todo[]>([]);
 * const searchTermAtom = atom('');
 * const store = createStore();
 * // StoreAdapter<{ todos: Todo[]; searchTerm: string }>
 * const adapter = createJotaiAdapter({ todos: todosAtom, searchTerm: searchTermAtom }, store);
 * createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter).connect();
 * ```
 */
export function createJotaiAdapter<R extends SyncedAtoms<R>>(
  atoms: R,
  store?: JotaiStore,
): StoreAdapter<SyncedAtomsState<R>>;

export function createJotaiAdapter(
  target: SyncedAtom<object> | AnyAtoms,
  store?: JotaiStore,
): StoreAdapter<object> | StoreAdapter<SyncedAtomsState<AnyAtoms>> {
  if (isAtom(target)) return new JotaiAdapter(target, store);
  return new JotaiAdapter(combineAtoms(target), store);
}

/** Whether `target` is an atom rather than a record of atoms, whose values are objects. */
const isAtom = (target: object): target is SyncedAtom<object> =>
  typeof (target as { read?: unknown }).read === "function";
