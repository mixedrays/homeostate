import type { PersistableDoc, Unsubscribe } from "@homeostate/core";

/** How the link between the app's document and the network behaves. */
export interface NetworkConditions {
  /** Milliseconds each update takes, either way. Defaults to 0. */
  latency: number;
  /** Up to this many more milliseconds per update, at random; updates still arrive in order. Defaults to 0. */
  jitter: number;
  /** Cuts the link: nothing passes either way until it is back. Defaults to `false`. */
  offline: boolean;
  /** Drops the link for 1 to 3 seconds every 3 to 10 seconds, at random. Defaults to `false`. */
  flaky: boolean;
}

export interface NetworkSnapshot {
  conditions: NetworkConditions;
  /** Whether updates pass: `false` while offline, or while a flaky link is down. */
  connected: boolean;
  /** Updates on their way from the network to the app's document. */
  incoming: number;
  /** Updates on their way from the app's document to the network. */
  outgoing: number;
}

/** A link between the app's document and the network, with conditions the devtools can change. */
export interface NetworkLink {
  getSnapshot: () => NetworkSnapshot;
  subscribe: (listener: () => void) => Unsubscribe;
  /** Change some conditions; the others keep their values. */
  setConditions: (conditions: Partial<NetworkConditions>) => void;
  /** Stop relaying updates; both documents keep what they hold. */
  destroy: () => void;
}

const DEFAULT_CONDITIONS: NetworkConditions = {
  latency: 0,
  jitter: 0,
  offline: false,
  flaky: false,
};

/** How long a flaky link stays up, then down, in milliseconds. */
const FLAKY_UP: [number, number] = [3000, 10000];
const FLAKY_DOWN: [number, number] = [1000, 3000];

const between = ([min, max]: [number, number]): number =>
  min + Math.random() * (max - min);

interface Direction {
  target: PersistableDoc;
  queue: { update: Uint8Array; at: number }[];
  timer: ReturnType<typeof setTimeout> | undefined;
  /** When the last queued update is due, so later ones never overtake it. */
  lastAt: number;
}

/**
 * Puts a link with adjustable network conditions between the app's document and the one its
 * provider syncs, for the devtools' Network tab. The provider syncs `wire` instead of `doc`,
 * and the link relays every update between the two: at once by default, or late, or not at
 * all while offline. Coming back online exchanges the whole documents, as a provider does on
 * reconnecting, so both sides merge what the other missed.
 *
 * Only document updates pass through the link. Presence, such as cursors, goes through the
 * provider directly and is not delayed. Use it in development: `wire` doubles the document.
 *
 * @example
 * ```ts
 * const doc = new Y.Doc();
 * const wire = new Y.Doc();
 * const network = createNetworkLink(createYjsPersistable(doc), createYjsPersistable(wire));
 * new WebsocketProvider(url, room, wire);
 * const backend = createYjsBackend(doc, "shared");
 * // Pass it with the devtools source: { name, adapter, backend, engine, network }
 * ```
 */
export function createNetworkLink(
  doc: PersistableDoc,
  wire: PersistableDoc,
  conditions: Partial<NetworkConditions> = {},
): NetworkLink {
  let current: NetworkConditions = { ...DEFAULT_CONDITIONS, ...conditions };
  let flakyDown = false;
  let flakyTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const listeners = new Set<() => void>();
  const incoming: Direction = {
    target: doc,
    queue: [],
    timer: undefined,
    lastAt: 0,
  };
  const outgoing: Direction = {
    target: wire,
    queue: [],
    timer: undefined,
    lastAt: 0,
  };

  const connected = (): boolean => !current.offline && !flakyDown;

  const read = (): NetworkSnapshot => ({
    conditions: current,
    connected: connected(),
    incoming: incoming.queue.length,
    outgoing: outgoing.queue.length,
  });
  let snapshot = read();

  const emit = (): void => {
    snapshot = read();
    listeners.forEach((listener) => listener());
  };

  const arm = (direction: Direction): void => {
    if (direction.timer !== undefined || direction.queue.length === 0) return;
    direction.timer = setTimeout(
      () => {
        direction.timer = undefined;
        const now = Date.now();
        while (direction.queue.length > 0 && direction.queue[0].at <= now)
          direction.target.apply(direction.queue.shift()!.update);
        arm(direction);
        emit();
      },
      Math.max(0, direction.queue[0].at - Date.now()),
    );
  };

  const send = (direction: Direction, update: Uint8Array): void => {
    // Lost while the link is down; the exchange on coming back brings it.
    if (destroyed || !connected()) return;
    const delay = current.latency + Math.random() * current.jitter;
    if (delay <= 0 && direction.queue.length === 0) {
      direction.target.apply(update);
      return;
    }
    const at = Math.max(Date.now() + delay, direction.lastAt);
    direction.lastAt = at;
    // The document may reuse its buffer for the next update.
    direction.queue.push({ update: update.slice(), at });
    arm(direction);
    emit();
  };

  const drop = (direction: Direction): void => {
    clearTimeout(direction.timer);
    direction.timer = undefined;
    direction.queue = [];
  };

  const exchange = (): void => {
    send(outgoing, doc.encode());
    send(incoming, wire.encode());
  };

  /** Drop what is on its way when the link goes down, and catch up when it comes back. */
  const settleLink = (wasConnected: boolean): void => {
    if (wasConnected && !connected()) {
      drop(incoming);
      drop(outgoing);
    } else if (!wasConnected && connected()) {
      exchange();
    }
  };

  const scheduleFlaky = (): void => {
    flakyTimer = setTimeout(
      () => {
        const wasConnected = connected();
        flakyDown = !flakyDown;
        settleLink(wasConnected);
        scheduleFlaky();
        emit();
      },
      between(flakyDown ? FLAKY_DOWN : FLAKY_UP),
    );
  };

  const unsubscribers = [
    doc.subscribe((update) => send(outgoing, update)),
    wire.subscribe((update) => send(incoming, update)),
  ];
  // Start in step: whatever either document holds reaches the other.
  if (connected()) exchange();
  if (current.flaky) scheduleFlaky();

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setConditions: (next) => {
      if (destroyed) return;
      const wasConnected = connected();
      current = { ...current, ...next };
      if (!current.flaky) {
        clearTimeout(flakyTimer);
        flakyTimer = undefined;
        flakyDown = false;
      } else if (flakyTimer === undefined) {
        scheduleFlaky();
      }
      settleLink(wasConnected);
      emit();
    },

    destroy: () => {
      destroyed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      drop(incoming);
      drop(outgoing);
      clearTimeout(flakyTimer);
      flakyTimer = undefined;
      emit();
    },
  };
}
