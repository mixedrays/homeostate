import { formatPath } from "./compare.js";
import type { Peer } from "./network.js";

/** Thrown by `advance` and `settle` when a peer lost a synced key; see `checkLostKeys`. */
export class LostKeyError extends Error {
  readonly seed: number;
  /** The peer's name. */
  readonly peer: string;
  readonly key: string;
  /** Virtual time of the checkpoint that found the loss, in milliseconds. */
  readonly at: number;

  constructor(
    message: string,
    details: { seed: number; peer: string; key: string; at: number },
  ) {
    super(message);
    this.name = "LostKeyError";
    this.seed = details.seed;
    this.peer = details.peer;
    this.key = details.key;
    this.at = details.at;
  }
}

/** What the check knows of one peer. */
interface Tracked {
  /** The store's synced keys at the peer's last checkpoint. */
  store: Set<string>;
  /** The document's keys, while they cannot have changed since they were read. */
  doc: Set<string> | undefined;
  /** The document's keys when it was last read, for telling which ones a change removed. */
  lastDoc: Set<string> | undefined;
  /** Whether the document changed outside a delivery since it was last read. */
  changedOutside: boolean;
  /** Keys a checkpoint saw both in the store and in the document. */
  held: Set<string>;
}

/**
 * Checks that no peer's store and document both lose a synced top-level key that no peer
 * deleted. The network calls it as its documents change and around its deliveries.
 */
export interface LostKeyCheck {
  /** Start tracking a peer, before it links and connects. */
  addPeer: (peer: Peer) => void;
  /** The peer's document changed; `outside` when no delivery is running. */
  changed: (peer: Peer, outside: boolean) => void;
  /**
   * Before deliveries: what changed since the last checkpoint was done by the test, so a key
   * that left a store or document is deleted.
   */
  beforeDeliveries: (peers: readonly Peer[]) => void;
  /** After a delivery to `peer` from `from`, or after the last one; throws a `LostKeyError`. */
  afterDelivery: (peer: Peer, at: number, from?: Peer) => void;
}

/** The keys of `state` that JSON keeps, as `peer.syncedState()` has them. */
const jsonKeys = (state: object): Set<string> => {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(state))
    if (
      value !== undefined &&
      typeof value !== "function" &&
      typeof value !== "symbol"
    )
      keys.add(key);
  return keys;
};

const formatTime = (ms: number): string => String(Number(ms.toFixed(2)));

export function createLostKeyCheck(seed: number): LostKeyCheck {
  const tracked = new Map<Peer, Tracked>();
  /** Keys a checkpoint outside a delivery saw leave a store or document; never cleared. */
  const deleted = new Set<string>();

  const storeKeys = (peer: Peer): Set<string> =>
    jsonKeys(peer.engine.getSyncedState());

  const docKeys = (peer: Peer, state: Tracked): Set<string> => {
    if (!state.doc) {
      state.doc = jsonKeys(peer.backend.read());
      // Only the test's own changes delete; a delivery that removes a key may be a loss.
      if (state.changedOutside && state.lastDoc)
        for (const key of state.lastDoc)
          if (!state.doc.has(key)) deleted.add(key);
      state.lastDoc = state.doc;
      state.changedOutside = false;
    }
    return state.doc;
  };

  /** Mark the keys that left the store since its last checkpoint as deleted. */
  const noteRemovals = (state: Tracked, store: Set<string>): void => {
    for (const key of state.store) if (!store.has(key)) deleted.add(key);
    state.store = store;
  };

  const hold = (peer: Peer, state: Tracked, keys: Iterable<string>): void => {
    for (const key of keys) {
      if (state.held.has(key) || deleted.has(key)) continue;
      if (docKeys(peer, state).has(key)) state.held.add(key);
    }
  };

  const track = (peer: Peer): Tracked => {
    const state = tracked.get(peer);
    if (!state) throw new Error(`${peer.name} is not on the network.`);
    return state;
  };

  return {
    addPeer: (peer) => {
      tracked.set(peer, {
        store: storeKeys(peer),
        doc: undefined,
        lastDoc: undefined,
        changedOutside: false,
        held: new Set(),
      });
    },

    changed: (peer, outside) => {
      const state = track(peer);
      state.doc = undefined;
      if (!outside) return;
      state.changedOutside = true;
      // A key added and removed again before the next delivery still counts as deleted.
      noteRemovals(state, storeKeys(peer));
    },

    beforeDeliveries: (peers) => {
      for (const peer of peers) {
        const state = track(peer);
        const store = storeKeys(peer);
        noteRemovals(state, store);
        if (state.changedOutside) docKeys(peer, state);
        hold(peer, state, store);
      }
    },

    afterDelivery: (peer, at, from) => {
      const state = track(peer);
      const store = storeKeys(peer);
      for (const key of state.held) {
        if (store.has(key)) continue;
        if (deleted.has(key)) {
          state.held.delete(key);
          continue;
        }
        if (docKeys(peer, state).has(key)) continue;
        const source = from ? `, on an update from ${from.name}` : "";
        throw new LostKeyError(
          `${peer.name} lost the synced key ${formatPath([key])} at ${formatTime(at)} ms (seed ${seed})${source}: its store and document both lack it, and no peer deleted it.`,
          { seed, peer: peer.name, key, at },
        );
      }
      const appeared = [...store].filter((key) => !state.store.has(key));
      state.store = store;
      hold(peer, state, appeared);
    },
  };
}
