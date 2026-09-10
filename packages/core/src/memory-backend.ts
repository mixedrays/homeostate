import type { CrdtBackend, Unsubscribe } from './types.js';

export interface MemoryBackend extends CrdtBackend {
  /** Replace the held state as if a remote peer had written it, then notify subscribers */
  receive: (next: unknown) => void;
}

const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

/**
 * Plain-JSON backend with no replication. It proves the engine has no
 * CRDT-library assumptions and gives tests a fast in-process peer.
 */
export const createMemoryBackend = (initial: unknown = {}): MemoryBackend => {
  let state = clone(initial);
  const listeners = new Set<() => void>();

  return {
    read: () => clone(state),

    write: (next) => {
      state = clone(next);
    },

    subscribe: (onRemoteChange): Unsubscribe => {
      listeners.add(onRemoteChange);
      return () => {
        listeners.delete(onRemoteChange);
      };
    },

    receive: (next) => {
      state = clone(next);
      listeners.forEach((listener) => listener());
    },
  };
};
