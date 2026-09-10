import type { CrdtBackend, Unsubscribe } from './types.js';

export interface MemoryBackend extends CrdtBackend<{ state: unknown }> {
  /** Replace the held state as if a remote peer had written it, then notify subscribers */
  receive: (next: unknown) => void;
}

const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'object' && Object.keys(value).length === 0);

/**
 * Plain-JSON backend with no replication. It proves the engine has no
 * CRDT-library assumptions and gives tests a fast in-process peer.
 */
export const createMemoryBackend = (initial: unknown = {}): MemoryBackend => {
  const holder = { state: clone(initial) };
  const listeners = new Set<() => void>();

  return {
    read: () => clone(holder.state),

    write: (next) => {
      holder.state = clone(next);
    },

    subscribe: (onRemoteChange): Unsubscribe => {
      listeners.add(onRemoteChange);
      return () => {
        listeners.delete(onRemoteChange);
      };
    },

    isEmpty: () => isEmptyValue(holder.state),

    native: () => holder,

    receive: (next) => {
      holder.state = clone(next);
      listeners.forEach((listener) => listener());
    },
  };
};
