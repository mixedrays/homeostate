import {
  createNetwork,
  type NetworkOptions,
  type Peer,
  type PeerSetup,
} from "./network.js";
import type { Path } from "./compare.js";
import { createRandom, randomSeed, type Random } from "./random.js";

/** One thing a step of a randomized run does to a peer's store. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RandomAction<S extends object = any> = (
  peer: Peer<S>,
  random: Random,
) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RandomizedOptions<S extends object = any> {
  /** Makes peer `index`; called once per peer as the run starts. */
  createPeer: (index: number) => PeerSetup<S>;
  /** Seed of the run, which a failure reports so it can be replayed. Defaults to a random seed. */
  seed?: number;
  /** Defaults to 3. */
  peers?: number;
  /** Defaults to 100. */
  steps?: number;
  /** What a step may do to a random peer's store, one picked at random. Defaults to `[randomEdit]`. */
  actions?: readonly RandomAction<S>[];
  /** Latency, drops and reordering, as for `createNetwork`. */
  network?: Omit<NetworkOptions, "seed">;
  /** Chance that a step cuts or restores a random link instead of changing a store. Defaults to 0.1. */
  linkChangeRate?: number;
  /** Most virtual milliseconds between two steps; each wait is random. Defaults to 10. */
  stepInterval?: number;
}

/**
 * Runs random steps against a fresh network, then heals it, settles it and checks that every
 * peer converged. Each step changes a random peer's store with a random action, or cuts or
 * restores a random link, and lets some virtual time pass, so changes cross each other on
 * their way.
 *
 * Rejects with an error that names the seed and step when a step throws or the peers do not
 * converge; pass that `seed` to replay the same run. Give each document a fixed ID for runs
 * that replay exactly, such as `doc.clientID = index + 1` for Yjs.
 */
export async function runRandomized<S extends object>(
  options: RandomizedOptions<S>,
): Promise<void> {
  const {
    createPeer,
    seed = randomSeed(),
    peers: peerCount = 3,
    steps = 100,
    actions = [randomEdit],
    network: networkOptions,
    linkChangeRate = 0.1,
    stepInterval = 10,
  } = options;
  // Apart from the network's, so adding an action does not change its latencies.
  const random = createRandom(seed ^ 0x5bd1e995);
  const network = createNetwork({ ...networkOptions, seed });
  let step = 0;

  try {
    const peers = Array.from({ length: peerCount }, (_, index) =>
      network.addPeer(createPeer(index)),
    );

    for (; step < steps; step++) {
      if (peers.length > 1 && random.chance(linkChangeRate)) {
        const a = random.pick(peers);
        const b = random.pick(peers.filter((peer) => peer !== a));
        if (network.linked(a, b)) network.disconnect(a, b);
        else network.connect(a, b);
      } else {
        random.pick(actions)(random.pick(peers), random);
      }
      await network.advance(random.int(stepInterval + 1));
    }

    network.heal();
    await network.settle();
    network.expectConverged();
  } catch (error) {
    const when =
      step < steps ? `at step ${step + 1} of ${steps}` : `after ${steps} steps`;
    const message = error instanceof Error ? error.message : String(error);
    throw Object.assign(
      new Error(
        `Randomized run failed ${when}; pass \`seed: ${seed}\` to replay it.\n${message}`,
      ),
      { cause: error },
    );
  } finally {
    network.destroy();
  }
}

type Plain = Record<string, unknown>;

const isRecord = (value: unknown): value is Plain =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Few keys, so peers often edit the same one at once. */
const KEYS = ["a", "b", "c", "d"];
/** Characters of one and two UTF-16 units, so string edits cross surrogate pairs. */
const CHARACTERS = ["x", "y", "é", "🙂", " "];

const randomText = (random: Random): string =>
  Array.from({ length: random.int(4) }, () => random.pick(CHARACTERS)).join("");

const randomValue = (random: Random, depth = 0): unknown => {
  const roll = random.next();
  if (depth < 2 && roll < 0.15)
    return Array.from({ length: random.int(3) }, () =>
      randomValue(random, depth + 1),
    );
  if (depth < 2 && roll < 0.3)
    return Object.fromEntries(
      Array.from({ length: random.int(3) }, () => [
        random.pick(KEYS),
        randomValue(random, depth + 1),
      ]),
    );
  if (roll < 0.55) return random.int(100);
  if (roll < 0.8) return randomText(random);
  if (roll < 0.95) return random.chance(0.5);
  return null;
};

/** `node` with what `edit` makes of the value at `path`, copying only along the path. */
const updateIn = (
  node: unknown,
  path: Path,
  edit: (value: unknown) => unknown,
): unknown => {
  if (path.length === 0) return edit(node);
  const [key, ...rest] = path;
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[key as number] = updateIn(node[key as number], rest, edit);
    return copy;
  }
  return {
    ...(node as Plain),
    [key]: updateIn((node as Plain)[key], rest, edit),
  };
};

/** A random change to `value`: an item or key added or removed, a string edited, or a new value. */
const editValue = (value: unknown, random: Random): unknown => {
  if (Array.isArray(value) && random.chance(0.7)) {
    const copy = value.slice();
    if (copy.length > 0 && random.chance(0.4))
      copy.splice(random.int(copy.length), 1);
    else copy.splice(random.int(copy.length + 1), 0, randomValue(random, 1));
    return copy;
  }
  if (isRecord(value) && random.chance(0.7)) {
    const copy = { ...value };
    const keys = Object.keys(copy);
    if (keys.length > 0 && random.chance(0.4)) delete copy[random.pick(keys)];
    else copy[random.pick(KEYS)] = randomValue(random, 1);
    return copy;
  }
  if (typeof value === "string" && random.chance(0.7)) {
    const characters = [...value];
    const at = random.int(characters.length + 1);
    if (characters.length > 0 && random.chance(0.4)) characters.splice(at, 1);
    else characters.splice(at, 0, random.pick(CHARACTERS));
    return characters.join("");
  }
  return randomValue(random);
};

/**
 * Makes one random change to the peer's store through `adapter.setState`, under one of the
 * synced keys it holds: adds or removes an array item or an object key, edits a string, or
 * replaces a value, at a random depth. It never adds or removes the store's own keys, and
 * leaves the others, actions included, as they are.
 *
 * Suits stores that take any JSON under their keys. For stores with a schema, such as
 * MobX-State-Tree models, pass actions that call the store's own API instead.
 */
export const randomEdit: RandomAction = (peer, random) => {
  const synced = peer.syncedState();
  if (!isRecord(synced)) return;
  const keys = Object.keys(synced);
  if (keys.length === 0) return;

  const path: Path = [random.pick(keys)];
  let node: unknown = synced[path[0]];
  while (random.chance(0.5)) {
    if (Array.isArray(node) && node.length > 0) {
      const index = random.int(node.length);
      path.push(index);
      node = node[index];
    } else if (isRecord(node) && Object.keys(node).length > 0) {
      const key = random.pick(Object.keys(node));
      path.push(key);
      node = node[key];
    } else break;
  }

  peer.adapter.setState(
    updateIn(peer.adapter.getState(), path, (value) =>
      editValue(value, random),
    ) as object,
  );
};
