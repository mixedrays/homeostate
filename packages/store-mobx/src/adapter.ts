import { reaction, runInAction, toJS } from "mobx";
import { applyChanges, getChanges } from "@homeostate/core";
import type {
  ApplyOps,
  Diffable,
  StoreAdapter,
  Unsubscribe,
} from "@homeostate/core";

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
  set: (target, key, value) => {
    (target as Plain)[key as string] = value;
  },
  remove: (target, key) => {
    delete (target as Plain)[key];
  },
  splice: (target, index, deleteCount, inserted) => {
    target.splice(index, deleteCount, ...inserted);
  },
};

class MobxAdapter<S extends object> implements StoreAdapter<S> {
  private store: S;
  private syncableKeys: (keyof S)[];

  /**
   * The last state `getState()` returned. The engine derives what it passes to `setState()`
   * from that very object and shares every subtree it did not change, so comparing against
   * it by reference identifies the untouched keys in one `Object.is` — which `toJS`, whose
   * every call is a fresh deep copy, can never do on its own.
   */
  private snapshot: S | undefined;

  /**
   * Create a MobX adapter
   * @param store - The MobX store instance
   * @param syncableKeys - Array of property keys that should be synced
   */
  constructor(store: S, syncableKeys: (keyof S)[]) {
    this.store = store;
    this.syncableKeys = syncableKeys;
  }

  getState(): S {
    const state: Partial<S> = {};
    for (const key of this.syncableKeys) {
      state[key] = toJS(this.store[key]);
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
      for (const key of this.syncableKeys) {
        if (!(key in next)) continue;

        const property = key as string;
        const value = next[key];
        if (Object.is(previous[property], value)) continue;

        const current = (this.store as Plain)[property];
        if (sameKind(previous[property], value) && sameKind(current, value))
          applyChanges(
            current as object,
            getChanges(previous[property] as Diffable, value as Diffable),
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
 * A remote change is reconciled into the observable tree rather than assigned over it: the
 * adapter diffs the incoming state against the snapshot it last handed out and writes only
 * the fields, elements and keys that differ. In MobX identity is the unit of reactivity, so
 * this is what keeps an `observer` row, a per-item `reaction` and a `useEffect` keyed on an
 * item quiet when that item did not change.
 *
 * @param store - The MobX store instance
 * @param syncableKeys - Array of property keys that should be synced
 * @returns StoreAdapter instance for the MobX store
 *
 * @example
 * ```typescript
 * import { makeAutoObservable } from 'mobx';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * class CounterStore {
 *   count = 0;
 *   constructor() { makeAutoObservable(this); }
 *   increment() { this.count++; }
 * }
 *
 * const store = new CounterStore();
 * const adapter = createMobxAdapter(store, ['count']);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export function createMobxAdapter<S extends object>(
  store: S,
  syncableKeys: (keyof S)[],
): StoreAdapter<S> {
  return new MobxAdapter(store, syncableKeys);
}
