import { atom, type ExtractAtomValue, type WritableAtom } from "jotai/vanilla";
import type { SyncedAtom } from "./adapter.js";

/**
 * A record of writable atoms to sync as one state, one top-level key per atom. Each atom must
 * accept a full replacement of its own value, as primitive, `atomWithReset` and `atomWithStorage`
 * atoms do.
 * Used as a constraint, `R extends SyncedAtoms<R>`, so each atom's value type comes from the atom.
 */
export type SyncedAtoms<R> = {
  [K in keyof R]: WritableAtom<
    ExtractAtomValue<R[K]>,
    [ExtractAtomValue<R[K]>],
    unknown
  >;
};

/** The synced state of a record of atoms: each key holds its atom's value. */
export type SyncedAtomsState<R> = { [K in keyof R]: ExtractAtomValue<R[K]> };

/** Any record of atoms `SyncedAtoms` accepts, its value types unknown. */
export type AnyAtoms = Record<
  string,
  WritableAtom<unknown, [unknown], unknown>
>;

/**
 * Combines a record of atoms into one writable root atom, which the sync engine can treat like
 * any synced atom. Its value holds every atom's value under the atom's key. Writing it sets, in
 * one `store.set`, so that the root's subscribers hear one notification, every atom whose value
 * changes; an atom whose key is absent or `undefined` is reset to its initial value, and one
 * without an initial value keeps its own.
 */
export function combineAtoms<R extends SyncedAtoms<R>>(
  atoms: R,
): SyncedAtom<SyncedAtomsState<R>> {
  const entries = Object.entries(atoms as AnyAtoms);
  return atom(
    (get) => {
      const state: Record<string, unknown> = {};
      for (const [key, member] of entries) state[key] = get(member);
      return state as SyncedAtomsState<R>;
    },
    (get, set, next: SyncedAtomsState<R>) => {
      const values = next as Record<string, unknown>;
      for (const [key, member] of entries) {
        let value = values[key];
        // An `undefined` value is an absent key, as JSON stores it. An atom without an initial
        // value keeps its own, which the engine then writes back.
        if (value === undefined) {
          if (!("init" in member)) continue;
          value = member.init;
        }
        // The engine keeps the identity of unchanged values, so an atom holding it is untouched.
        if (!Object.is(get(member), value)) set(member, value);
      }
    },
  );
}
