import {
  isComputedProp,
  isObservableProp,
  keys as observableKeys,
  reaction,
  runInAction,
  toJS,
} from "mobx";
import { applyChanges } from "@homeostate/core";
import type { ApplyOps, StoreAdapter, Unsubscribe } from "@homeostate/core";

type Plain = Record<string, unknown>;

const isRecord = (value: unknown): value is Plain =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Whether a change to `b` can be written into `a` in place rather than replacing it. */
const sameKind = (a: unknown, b: unknown): boolean =>
  (Array.isArray(a) && Array.isArray(b)) || (isRecord(a) && isRecord(b));

/**
 * Plain writes, run inside the adapter's own `runInAction`. MobX makes whatever lands
 * observable, so the values the edit script carries can go in as they are — and a field
 * assigned on an existing node keeps that node, which is the whole point of reconciling.
 */
const mobxOps: ApplyOps = {
  kind: (value) =>
    Array.isArray(value) ? "list" : isRecord(value) ? "record" : undefined,
  get: (container, key) => (container as Plain)[key],
  set: (container, key, value) => {
    (container as Plain)[key as string] = value;
  },
  remove: (container, key) => {
    delete (container as Plain)[key];
  },
  splice: (list, index, deleteCount, inserted) => {
    (list as unknown[]).splice(index, deleteCount, ...inserted);
  },
};

/**
 * Removes a synced key a remote peer deleted. A property of an `observable({...})` object is
 * deleted; a class field `makeObservable` defined is non-configurable, so `delete` fails and
 * the field is set to `undefined` instead, which `getState()` reads as absent.
 */
const removeKey = (store: object, key: string): void => {
  if (!Reflect.deleteProperty(store, key)) (store as Plain)[key] = undefined;
};

/** The keys of `S` that hold data rather than methods: the keys a MobX store can sync. */
type DataKey<S> = {
  [K in keyof S]-?: S[K] extends (...args: never[]) => unknown ? never : K;
}[keyof S] &
  string;

/**
 * Which fields of the store `createMobxAdapter` syncs: `keys` lists them, or `omit` names the
 * ones to keep local among every observable data field. Giving both is a type error.
 */
export type MobxAdapterOptions<
  S extends object,
  K extends DataKey<S> = DataKey<S>,
  O extends DataKey<S> = never,
> =
  | {
      /** The fields to sync, and nothing else. */
      keys: readonly K[];
      omit?: never;
    }
  | {
      keys?: never;
      /** Observable data fields to keep local; every other one syncs. */
      omit?: readonly O[];
    };

/**
 * The store's own enumerable observable fields, less computeds and actions. MobX's `keys()`
 * lists every own enumerable property, including a field `makeObservable` was not told about
 * and an arrow-function field `makeAutoObservable` made an action, and throws for a store that
 * is not observable at all.
 */
const dataKeys = (store: object): string[] =>
  observableKeys(store).filter(
    (key): key is string =>
      typeof key === "string" &&
      isObservableProp(store, key) &&
      !isComputedProp(store, key) &&
      typeof (store as Plain)[key] !== "function",
  );

class MobxAdapter<S extends object> implements StoreAdapter<S> {
  private store: object;
  private syncableKeys: readonly string[];

  /**
   * The last state `getState()` returned. The engine derives what it passes to `setState()`
   * from that very object and shares every subtree it did not change, so comparing against
   * it by reference identifies the untouched keys in one `Object.is` — which `toJS`, whose
   * every call is a fresh deep copy, can never do on its own.
   */
  private snapshot: S | undefined;

  constructor(store: object, syncableKeys: readonly string[]) {
    this.store = store;
    this.syncableKeys = syncableKeys;
  }

  getState(): S {
    const state: Plain = {};
    for (const key of this.syncableKeys) {
      // `undefined` is how a synced key reads as absent, as in JSON: a removed class field
      // cannot be deleted, so it holds `undefined` until something assigns it again.
      const value = toJS((this.store as Plain)[key]);
      if (value !== undefined) state[key] = value;
    }
    this.snapshot = state as S;
    return this.snapshot;
  }

  setState(next: S): void {
    // The engine reads `getState()` immediately before every `setState()` and nothing runs in
    // between, so the snapshot is current here; the fallback only covers a direct caller.
    const previous = (this.snapshot ?? this.getState()) as Plain;
    const applied: Plain = { ...previous };

    runInAction(() => {
      for (const property of this.syncableKeys) {
        if (!(property in next)) {
          if (property in previous) {
            removeKey(this.store, property);
            delete applied[property];
          }
          continue;
        }

        const value = (next as Plain)[property];
        if (Object.is(previous[property], value)) continue;

        const current = (this.store as Plain)[property];
        if (sameKind(previous[property], value) && sameKind(current, value))
          applyChanges(
            current as object,
            previous[property] as object,
            value as object,
            mobxOps,
          );
        else (this.store as Plain)[property] = value;

        applied[property] = value;
      }
    });

    this.snapshot = applied as S;
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return reaction(
      () => this.getState(),
      () => onStoreChange(),
    );
  }
}

/**
 * Creates a MobX-specific store adapter that bridges MobX stores with the sync engine.
 *
 * Without `keys`, the adapter syncs the store's observable data fields as they are when it is
 * created: every field `makeAutoObservable` or `makeObservable` made observable, and every data
 * property of an `observable({...})` object. Computeds, actions and fields that are not
 * observable stay local, and so do the fields `omit` names. `keys` syncs the fields it lists
 * instead. The synced state is typed as those fields alone, `Pick<S, K>`, without the store's
 * methods. A computed getter looks like a field to TypeScript, so do not list one in `keys`.
 *
 * A remote change is reconciled into the observable tree rather than assigned over it: the
 * adapter diffs the incoming state against the snapshot it last handed out and writes only
 * the fields, elements and keys that differ. In MobX identity is the unit of reactivity, so
 * this is what keeps an `observer` row, a per-item `reaction` and a `useEffect` keyed on an
 * item quiet when that item did not change.
 *
 * A synced key a remote peer removes is deleted from an `observable({...})` object. A class
 * field made observable by `makeObservable` or `makeAutoObservable` cannot be deleted, so it
 * is set to `undefined`. Either way it is left out of the synced state, which omits every
 * synced key whose value is `undefined`, until a local assignment gives it a value again.
 *
 * @param store - The MobX store instance, already made observable
 * @param options - `keys` to sync only the fields it lists, or `omit` to keep some fields local
 * @returns StoreAdapter instance for the MobX store
 * @throws TypeError when the keys are passed as an array, the signature before 0.3.0
 *
 * @example
 * ```typescript
 * import { makeAutoObservable } from 'mobx';
 * import * as Y from 'yjs';
 * import { createSyncEngine } from '@homeostate/core';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * class TodoStore {
 *   todos: { id: string; title: string }[] = [];
 *   draft = '';
 *   constructor() { makeAutoObservable(this); }
 *   add() { this.todos.push({ id: crypto.randomUUID(), title: this.draft }); }
 * }
 *
 * const store = new TodoStore();
 * const adapter = createMobxAdapter(store, { omit: ['draft'] });
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export function createMobxAdapter<
  S extends object,
  K extends DataKey<S> = DataKey<S>,
  O extends DataKey<S> = never,
>(
  store: S,
  options: MobxAdapterOptions<S, K, O> = {},
): StoreAdapter<Pick<S, Exclude<K, O>>> {
  if (Array.isArray(options))
    throw new TypeError(
      "createMobxAdapter takes its keys as an option, createMobxAdapter(store, { keys: [...] }), " +
        "or syncs every observable field without them",
    );
  const omitted: readonly string[] = options.omit ?? [];
  const synced = (options.keys ?? dataKeys(store)).filter(
    (key) => !omitted.includes(key),
  );
  return new MobxAdapter(store, synced);
}
