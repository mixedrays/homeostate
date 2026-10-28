import type { CrdtBackend, Unsubscribe } from "./types.js";

export interface MemoryBackend extends CrdtBackend {
  /** Replace the held state as if a remote peer had written it, then notify subscribers */
  receive: (next: unknown) => void;
  /** Counts the writes and receives so far */
  revision: () => number;
}

const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

/**
 * Plain-JSON backend with no replication. It proves the engine has no
 * CRDT-library assumptions and gives tests a fast in-process peer.
 */
export const createMemoryBackend = (initial: unknown = {}): MemoryBackend => {
  let state = clone(initial);
  let changes = 0;
  const listeners = new Set<() => void>();

  return {
    read: () => clone(state),

    write: (next) => {
      state = clone(next);
      changes++;
    },

    revision: () => changes,

    subscribe: (onRemoteChange): Unsubscribe => {
      listeners.add(onRemoteChange);
      return () => {
        listeners.delete(onRemoteChange);
      };
    },

    receive: (next) => {
      state = clone(next);
      changes++;
      listeners.forEach((listener) => listener());
    },
  };
};
