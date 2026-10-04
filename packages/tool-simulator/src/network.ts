import {
  createSyncEngine,
  defaultSyncFilter,
  type CrdtBackend,
  type PersistableDoc,
  type StoreAdapter,
  type SyncEngine,
  type SyncEngineConfig,
  type Unsubscribe,
} from "@homeostate/core";
import {
  asJson,
  firstDifference,
  formatPath,
  formatValue,
  syncedJson,
} from "./compare.js";
import { createRandom, randomSeed } from "./random.js";

/**
 * What a peer is made of: a store and a backend, as for `createSyncEngine`, and the backend's
 * document as binary updates, which is what the network carries. Use the same document for
 * `backend` and `doc`, e.g. `createYjsBackend(doc, "shared")` and `createYjsPersistable(doc)`.
 */
// `any` so a `PeerSetup<TodoState>` fits: `setState` makes the adapter invariant in `S`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PeerSetup<S extends object = any> {
  adapter: StoreAdapter<S>;
  backend: CrdtBackend;
  doc: PersistableDoc;
  /** Passed to `createSyncEngine`; its `filter` also decides what convergence compares. */
  config?: SyncEngineConfig;
  /** Names the peer in convergence errors. Defaults to `peer-<index>`. */
  name?: string;
  /**
   * Whether to connect the engine as the peer joins, before the network has delivered it the
   * other peers' state. Defaults to `true`. Pass `false` and call `peer.engine.connect()`
   * after `settle()` to model an app that waits for its provider to sync first.
   */
  connect?: boolean;
}

/** A peer on the network: its setup and the sync engine running between its store and backend. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Peer<S extends object = any> {
  /** Position in `network.peers`. */
  readonly index: number;
  readonly name: string;
  readonly adapter: StoreAdapter<S>;
  readonly backend: CrdtBackend;
  readonly doc: PersistableDoc;
  readonly engine: SyncEngine;
  /** The store's synced keys, as JSON. */
  syncedState: () => unknown;
}

export interface NetworkOptions {
  /** Seed for every random choice, so a run can be replayed. Defaults to a random seed. */
  seed?: number;
  /**
   * Time a message takes, in virtual milliseconds: a number, or `[min, max]` for a random time
   * in that range. Defaults to 0.
   */
  latency?: number | readonly [number, number];
  /** Probability that an update is lost on its way. Defaults to 0. */
  dropRate?: number;
  /**
   * Whether messages between two peers may overtake each other. Defaults to `false`, as over
   * a WebSocket; with `true`, each takes its own random latency.
   */
  reorder?: boolean;
  /**
   * Deliveries one `settle()` makes before it gives up on a network that never quiets, such
   * as two peers writing in a loop. Defaults to 100 000.
   */
  maxDeliveries?: number;
}

export interface NetworkStats {
  /** Messages handed to the network, updates and the documents exchanged on connecting. */
  sent: number;
  delivered: number;
  /** Updates lost to `dropRate`. */
  dropped: number;
  /** Messages lost because their link was cut while they were on their way. */
  cut: number;
  /** Messages on their way. */
  inFlight: number;
}

/**
 * Peers connected by a simulated network that runs on virtual time. Each change to a peer's
 * document goes to every peer it is linked to, after the latency, unless it is dropped or its
 * link is cut first. Linking two peers, as `connect` and `heal` do, makes them exchange their
 * whole documents, as providers do on reconnecting, so what was lost on the way arrives.
 */
export interface Network {
  /** The seed of this network's random choices. */
  readonly seed: number;
  /** Every peer, in the order they joined. */
  readonly peers: readonly Peer[];
  /** Virtual time, in milliseconds. */
  now: () => number;
  /**
   * Add a peer, linked to every peer already on the network, and connect its engine unless
   * `setup.connect` is `false`. It exchanges its document with each of them.
   */
  addPeer: <S extends object>(setup: PeerSetup<S>) => Peer<S>;
  /** Whether two peers are linked. */
  linked: (a: Peer, b: Peer) => boolean;
  /** Link two peers, and have them exchange their documents. */
  connect: (a: Peer, b: Peer) => void;
  /** Cut the link between two peers; messages on their way between them are lost. */
  disconnect: (a: Peer, b: Peer) => void;
  /** Cut a peer off from every other, as going offline does. */
  isolate: (peer: Peer) => void;
  /**
   * Split the network: peers are linked only to the peers in their own group, and peers in
   * no group to none. Links that come back exchange documents.
   */
  partition: (...groups: Peer[][]) => void;
  /**
   * Link every pair of peers and have each exchange documents, as if every peer reconnected,
   * so that updates lost to drops and cut links arrive too.
   */
  heal: () => void;
  /** Deliver the messages due within the next `ms` of virtual time, and move time on. */
  advance: (ms: number) => Promise<void>;
  /** Deliver every message on its way, and those they lead to, until none are left. */
  settle: () => Promise<void>;
  stats: () => NetworkStats;
  /**
   * Where the peers do not agree, one line each: a peer's document against the first peer's,
   * a peer's store against the first peer's, and a connected peer's store against its own
   * document. Empty once the peers have converged.
   */
  differences: () => string[];
  /** Throws a `ConvergenceError` unless `differences()` is empty. */
  expectConverged: () => void;
  /** Disconnect every engine, stop listening to every document and drop what is on its way. */
  destroy: () => void;
}

/** Thrown by `expectConverged`; the message lists the differences. */
export class ConvergenceError extends Error {
  readonly differences: string[];
  readonly seed: number;

  constructor(message: string, differences: string[], seed: number) {
    super(message);
    this.name = "ConvergenceError";
    this.differences = differences;
    this.seed = seed;
  }
}

interface Message {
  from: Peer;
  to: Peer;
  update: Uint8Array;
  at: number;
  /** Breaks ties between messages due at the same time, in the order they were sent. */
  order: number;
}

// Taken now, so a test that fakes timers later still lets `settle()` reach the event loop.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

/** Lets work a delivery started, such as a store that notifies asynchronously, finish. */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => realSetTimeout(resolve, 0));

const linkKey = (a: Peer, b: Peer): string =>
  a.index < b.index ? `${a.index}:${b.index}` : `${b.index}:${a.index}`;

/**
 * Creates an empty network. Add peers with `addPeer`, change their stores, then `settle()` and
 * `expectConverged()`.
 *
 * @example
 * ```typescript
 * const network = createNetwork({ latency: [5, 50], seed: 42 });
 * const [alice, bob] = [0, 1].map(() => {
 *   const doc = new Y.Doc();
 *   const store = createStore(() => ({ todos: [] }));
 *   return network.addPeer({
 *     adapter: createZustandAdapter(store),
 *     backend: createYjsBackend(doc, "shared"),
 *     doc: createYjsPersistable(doc),
 *   });
 * });
 * network.isolate(alice);
 * // ...edit both stores...
 * network.heal();
 * await network.settle();
 * network.expectConverged();
 * ```
 */
export function createNetwork(options: NetworkOptions = {}): Network {
  const {
    seed = randomSeed(),
    latency = 0,
    dropRate = 0,
    reorder = false,
    maxDeliveries = 100_000,
  } = options;
  const random = createRandom(seed);
  const peers: Peer[] = [];
  const unsubscribers: Unsubscribe[] = [];
  /** Pairs of peers whose link is cut; every other pair is linked. */
  const cut = new Set<string>();
  /** When the last message from one peer to another is due, to keep links in order. */
  const lastDue = new Map<string, number>();
  let queue: Message[] = [];
  let now = 0;
  let order = 0;
  const stats = { sent: 0, delivered: 0, dropped: 0, cut: 0 };

  const delay = (): number => {
    if (typeof latency === "number") return latency;
    const [min, max] = latency;
    return min + random.next() * (max - min);
  };

  const schedule = (from: Peer, to: Peer, update: Uint8Array): void => {
    stats.sent++;
    let at = now + delay();
    if (!reorder) {
      const key = `${from.index}>${to.index}`;
      at = Math.max(at, lastDue.get(key) ?? 0);
      lastDue.set(key, at);
    }
    const message: Message = { from, to, update, at, order: order++ };
    // Keep the queue sorted by due time, then by sending order.
    let index = queue.length;
    while (
      index > 0 &&
      (queue[index - 1].at > at ||
        (queue[index - 1].at === at && queue[index - 1].order > message.order))
    )
      index--;
    queue.splice(index, 0, message);
  };

  const linked = (a: Peer, b: Peer): boolean =>
    a !== b && !cut.has(linkKey(a, b));

  const broadcast = (from: Peer, update: Uint8Array): void => {
    for (const to of peers) {
      if (!linked(from, to)) continue;
      if (random.chance(dropRate)) {
        stats.sent++;
        stats.dropped++;
        continue;
      }
      // The document may reuse its buffer for the next update.
      schedule(from, to, update.slice());
    }
  };

  const link = (a: Peer, b: Peer): void => {
    if (a === b) return;
    cut.delete(linkKey(a, b));
    // Never dropped, so linking always lets two peers catch up.
    schedule(a, b, a.doc.encode());
    schedule(b, a, b.doc.encode());
  };

  const unlink = (a: Peer, b: Peer): void => {
    if (a === b) return;
    cut.add(linkKey(a, b));
    const before = queue.length;
    queue = queue.filter(
      ({ from, to }) => !((from === a && to === b) || (from === b && to === a)),
    );
    stats.cut += before - queue.length;
  };

  const deliver = (message: Message): void => {
    now = Math.max(now, message.at);
    stats.delivered++;
    message.to.doc.apply(message.update);
  };

  /** Deliver messages due by `until`, letting each delivery's work finish before the next. */
  const run = async (until: number): Promise<void> => {
    let deliveries = 0;
    for (;;) {
      const next = queue[0];
      if (next && next.at <= until) {
        if (++deliveries > maxDeliveries)
          throw new Error(
            `The network did not settle after ${maxDeliveries} deliveries; is a peer writing in a loop?`,
          );
        queue.shift();
        deliver(next);
        await Promise.resolve();
        continue;
      }
      // Asynchronous stores may still send; only stop once a full turn sends nothing.
      await yieldToEventLoop();
      const due = queue[0];
      if (!due || due.at > until) return;
    }
  };

  const view = (peer: Peer) => ({
    store: peer.syncedState(),
    document: asJson(peer.backend.read()),
  });

  const differences = (): string[] => {
    const lines: string[] = [];
    const describe = (subject: string, left: unknown, right: unknown): void => {
      const difference = firstDifference(left, right);
      if (difference)
        lines.push(
          `${subject} at ${formatPath(difference.path)}: ${formatValue(difference.left)} vs ${formatValue(difference.right)}`,
        );
    };

    const views = peers.map(view);
    peers.forEach((peer, i) => {
      if (peer.engine.isConnected())
        describe(
          `${peer.name}'s store differs from its document`,
          views[i].store,
          views[i].document,
        );
    });
    const [first] = peers;
    for (let i = 1; i < peers.length; i++) {
      describe(
        `${peers[i].name}'s document differs from ${first.name}'s`,
        views[i].document,
        views[0].document,
      );
      describe(
        `${peers[i].name}'s store differs from ${first.name}'s`,
        views[i].store,
        views[0].store,
      );
    }
    return lines;
  };

  return {
    seed,
    peers,
    now: () => now,

    addPeer: <S extends object>(setup: PeerSetup<S>): Peer<S> => {
      const index = peers.length;
      const engine = createSyncEngine(
        setup.backend,
        setup.adapter,
        setup.config,
      );
      const filter = setup.config?.filter ?? defaultSyncFilter;
      const peer: Peer<S> = {
        index,
        name: setup.name ?? `peer-${index}`,
        adapter: setup.adapter,
        backend: setup.backend,
        doc: setup.doc,
        engine,
        syncedState: () => syncedJson(setup.adapter.getState(), filter),
      };
      peers.push(peer);
      unsubscribers.push(
        setup.doc.subscribe((update) => broadcast(peer, update)),
      );
      for (const other of peers) link(peer, other);
      if (setup.connect !== false) engine.connect();
      return peer;
    },

    linked,

    connect: link,

    disconnect: unlink,

    isolate: (peer) => {
      for (const other of peers) unlink(peer, other);
    },

    partition: (...groups) => {
      const groupOf = (peer: Peer): number =>
        groups.findIndex((group) => group.includes(peer));
      for (const a of peers)
        for (const b of peers) {
          if (a.index >= b.index) continue;
          const together = groupOf(a) !== -1 && groupOf(a) === groupOf(b);
          if (!together) unlink(a, b);
          else if (!linked(a, b)) link(a, b);
        }
    },

    heal: () => {
      for (const a of peers)
        for (const b of peers) if (a.index < b.index) link(a, b);
    },

    advance: async (ms) => {
      const until = now + ms;
      await run(until);
      now = until;
    },

    settle: () => run(Infinity),

    stats: () => ({ ...stats, inFlight: queue.length }),

    differences,

    expectConverged: () => {
      const lines = differences();
      if (lines.length === 0) return;
      const inFlight =
        queue.length > 0
          ? `\n${queue.length} messages are still on their way: settle() delivers them.`
          : "";
      throw new ConvergenceError(
        `${peers.length} peers did not converge (seed ${seed}):\n${lines
          .map((line) => `- ${line}`)
          .join("\n")}${inFlight}`,
        lines,
        seed,
      );
    },

    destroy: () => {
      for (const peer of peers) peer.engine.disconnect();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers.length = 0;
      queue = [];
    },
  };
}
