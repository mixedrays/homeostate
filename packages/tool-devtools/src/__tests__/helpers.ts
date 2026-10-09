import type { PersistableDoc, StoreAdapter } from "@homeostate/core";

/** A minimal store and its adapter, notifying synchronously like most state managers. */
export const createTestStore = <S extends object>(initial: S) => {
  let state = initial;
  const listeners = new Set<() => void>();

  const set = (next: S): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const adapter: StoreAdapter<S> = {
    getState: () => state,
    setState: set,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return { adapter, set, get: () => state };
};

/** A document of strings merged as a set: enough for `createPersistence` to store. */
export const createTestDoc = () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const ops = new Set<string>();
  const listeners = new Set<(update: Uint8Array) => void>();
  const encode = (list: string[]) => encoder.encode(JSON.stringify(list));

  const doc: PersistableDoc & { add: (op: string) => void } = {
    encode: () => encode([...ops]),
    apply: (update) => {
      for (const op of JSON.parse(decoder.decode(update)) as string[])
        ops.add(op);
    },
    subscribe: (onUpdate) => {
      listeners.add(onUpdate);
      return () => {
        listeners.delete(onUpdate);
      };
    },
    add: (op) => {
      ops.add(op);
      listeners.forEach((listener) => listener(encode([op])));
    },
  };
  return doc;
};

/** Lets the inspector's microtask flush run. */
export const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
