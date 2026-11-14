import { afterEach, describe, expect, it } from "vitest";
import type { PersistableDoc, StoreAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import {
  ConvergenceError,
  createNetwork,
  LostKeyError,
  type Network,
  type NetworkOptions,
} from "../index";
import {
  backends,
  createStandIn,
  standInPeer,
  todoPeer,
  type TodoState,
} from "./helpers";

let network: Network | undefined;

afterEach(() => {
  network?.destroy();
  network = undefined;
});

const createTodoNetwork = (
  docs: (typeof backends)[number][1],
  count: number,
  options: NetworkOptions,
) => {
  network = createNetwork(options);
  const peers = Array.from({ length: count }, (_, index) =>
    todoPeer(docs, index),
  );
  for (const { setup } of peers) network.addPeer(setup);
  return { network, stores: peers.map(({ store }) => store) };
};

describe.each(backends)("%s peers", (_name, docs) => {
  it("converge after concurrent edits", async () => {
    const { network, stores } = createTodoNetwork(docs, 3, {
      seed: 1,
      latency: [1, 20],
    });
    await network.settle();

    stores[0].setState({ title: "groceries" });
    stores[1].setState({ todos: [{ title: "milk", done: false }] });
    stores[2].setState({ meta: { color: "red" } });
    await network.settle();

    network.expectConverged();
    expect(stores[2].getState()).toMatchObject({
      title: "groceries",
      todos: [{ title: "milk", done: false }],
      meta: { color: "red" },
    });
  });

  it("stay apart while partitioned and converge once healed", async () => {
    const { network, stores } = createTodoNetwork(docs, 3, {
      seed: 2,
      latency: 5,
    });
    await network.settle();
    const [a, b, c] = network.peers;

    network.partition([a], [b, c]);
    stores[0].setState({ meta: { side: "a" } });
    stores[1].setState({ todos: [{ title: "bread", done: true }] });
    await network.settle();

    expect(stores[2].getState().todos).toEqual([
      { title: "bread", done: true },
    ]);
    expect(stores[0].getState().todos).toEqual([]);
    expect(() => network.expectConverged()).toThrow(ConvergenceError);

    network.heal();
    await network.settle();
    network.expectConverged();
    expect(stores[0].getState()).toMatchObject({
      todos: [{ title: "bread", done: true }],
      meta: { side: "a" },
    });
  });

  it("hand a peer that joins late the state of the room", async () => {
    const { network, stores } = createTodoNetwork(docs, 2, {
      seed: 3,
      latency: [1, 10],
    });
    await network.settle();
    stores[0].setState({ todos: [{ title: "milk", done: false }] });
    await network.settle();

    // Connect once the room's state has arrived, as an app waiting for its provider would.
    const late = todoPeer(docs, 2, { connect: false });
    const peer = network.addPeer(late.setup);
    await network.settle();
    peer.engine.connect();
    await network.settle();

    network.expectConverged();
    expect(late.store.getState().todos).toEqual([
      { title: "milk", done: false },
    ]);
  });

  it.each([
    [0, 1],
    [1, 0],
  ])(
    "keep the room for a joiner that connects once it has arrived (room %i, joiner %i)",
    async (roomIndex, joinerIndex) => {
      network = createNetwork({ seed: 5, latency: [1, 10] });
      const room = todoPeer(docs, roomIndex);
      network.addPeer(room.setup);
      await network.settle();
      room.store.setState({ title: "groceries" });
      await network.settle();

      const joiner = todoPeer(docs, joinerIndex, { connect: false });
      joiner.store.setState({ extra: "mine" } as Partial<TodoState>);
      const peer = network.addPeer(joiner.setup);
      await network.settle();

      // Its key only the store holds is not written yet, so the room has not converged.
      expect(() => network?.expectConverged()).toThrow(ConvergenceError);

      peer.engine.connect();
      await network.settle();

      network.expectConverged();
      for (const peer of [room, joiner])
        expect(peer.store.getState()).toMatchObject({
          title: "groceries",
          extra: "mine",
        });
    },
  );

  it("catch up on dropped updates when they reconnect", async () => {
    const dropping = createNetwork({ seed: 4, dropRate: 1 });
    network = dropping;
    const first = todoPeer(docs, 0);
    const second = todoPeer(docs, 1, { connect: false });
    dropping.addPeer(first.setup);
    dropping.addPeer(second.setup);
    // Connected before the first peer's state arrives, the second would seed a title of its
    // own: the merge keeps one of the two, and edits to the other are lost. Only updates are
    // dropped, never the documents exchanged on linking, so that state does arrive.
    await dropping.settle();
    dropping.peers[1].engine.connect();

    first.store.setState({ title: "lost" });
    await dropping.settle();
    expect(dropping.stats().dropped).toBeGreaterThan(0);
    expect(() => dropping.expectConverged()).toThrow(ConvergenceError);

    dropping.heal();
    await dropping.settle();
    dropping.expectConverged();
    expect(second.store.getState().title).toBe("lost");
  });

  it("lose what is on its way when their link is cut", async () => {
    const { network, stores } = createTodoNetwork(docs, 2, {
      seed: 5,
      latency: 10,
    });
    await network.settle();
    const [a, b] = network.peers;

    stores[0].setState({ title: "cut" });
    network.disconnect(a, b);
    await network.settle();
    expect(network.stats().cut).toBeGreaterThan(0);
    expect(stores[1].getState().title).toBe("");

    network.connect(a, b);
    await network.settle();
    network.expectConverged();
  });

  it("converge with messages overtaking each other", async () => {
    const { network, stores } = createTodoNetwork(docs, 3, {
      seed: 6,
      latency: [1, 40],
      reorder: true,
    });
    await network.settle();

    for (let step = 0; step < 30; step++) {
      const store = stores[step % 3];
      const { todos } = store.getState();
      if (step % 4 === 3 && todos.length > 0)
        store.setState({
          todos: todos.map((todo, i) =>
            i === 0 ? { ...todo, done: !todo.done } : todo,
          ),
        });
      else
        store.setState({
          todos: [...todos, { title: `todo ${step}`, done: false }],
        });
      await network.advance(3);
    }
    await network.settle();

    network.expectConverged();
  });
});

/** A document that records what reaches it, for testing the network on its own. */
const createRecordingDoc = () => {
  const listeners = new Set<(update: Uint8Array) => void>();
  const received: number[] = [];
  const doc: PersistableDoc & { send: (value: number) => void } = {
    encode: () => new Uint8Array(),
    apply: (update) => {
      if (update.length > 0) received.push(update[0]);
    },
    subscribe: (onUpdate) => {
      listeners.add(onUpdate);
      return () => {
        listeners.delete(onUpdate);
      };
    },
    send: (value) =>
      listeners.forEach((listener) => listener(new Uint8Array([value]))),
  };
  return { doc, received };
};

const emptyAdapter = (): StoreAdapter<object> => ({
  getState: () => ({}),
  setState: () => {},
  subscribe: () => () => {},
});

const addRecordingPeer = (network: Network) => {
  const recording = createRecordingDoc();
  network.addPeer({
    adapter: emptyAdapter(),
    backend: createMemoryBackend(),
    doc: recording.doc,
  });
  return recording;
};

describe("createNetwork", () => {
  it("holds each message for its latency", async () => {
    network = createNetwork({ latency: 10 });
    const a = addRecordingPeer(network);
    const b = addRecordingPeer(network);
    await network.settle();

    a.doc.send(1);
    await network.advance(9);
    expect(b.received).toEqual([]);
    await network.advance(1);
    expect(b.received).toEqual([1]);
  });

  it("keeps each link in order unless reorder is set", async () => {
    const arrivals = async (reorder: boolean) => {
      const network = createNetwork({ seed: 7, latency: [1, 100], reorder });
      const a = addRecordingPeer(network);
      const b = addRecordingPeer(network);
      for (let value = 0; value < 20; value++) a.doc.send(value);
      await network.settle();
      network.destroy();
      return b.received;
    };
    const sent = Array.from({ length: 20 }, (_, value) => value);

    expect(await arrivals(false)).toEqual(sent);
    const reordered = await arrivals(true);
    expect(reordered).not.toEqual(sent);
    expect([...reordered].sort((x, y) => x - y)).toEqual(sent);
  });

  it("replays the same run for the same seed", async () => {
    const arrivals = async () => {
      const network = createNetwork({
        seed: 8,
        latency: [1, 100],
        reorder: true,
        dropRate: 0.3,
      });
      const a = addRecordingPeer(network);
      const b = addRecordingPeer(network);
      for (let value = 0; value < 20; value++) a.doc.send(value);
      await network.settle();
      network.destroy();
      return b.received;
    };

    expect(await arrivals()).toEqual(await arrivals());
  });

  it("gives up on a network that never quiets", async () => {
    network = createNetwork({ maxDeliveries: 50 });
    // Each peer answers every message with one of its own.
    for (let i = 0; i < 2; i++) {
      const recording = createRecordingDoc();
      network.addPeer({
        adapter: emptyAdapter(),
        backend: createMemoryBackend(),
        doc: {
          ...recording.doc,
          apply: (update) => recording.doc.send(update[0] ?? 0),
        },
      });
    }

    await expect(network.settle()).rejects.toThrow(
      "The network did not settle after 50 deliveries",
    );
  });

  it("says where peers differ", async () => {
    const [, yjs] = backends[0];
    const { network, stores } = createTodoNetwork(yjs, 2, { seed: 9 });
    await network.settle();
    network.isolate(network.peers[0]);
    stores[0].setState({ title: "hello" });
    await network.settle();

    let error: unknown;
    try {
      network.expectConverged();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConvergenceError);
    expect((error as ConvergenceError).message).toBe(
      [
        "2 peers did not converge (seed 9):",
        `- peer-1's document differs from peer-0's at title: "" vs "hello"`,
        `- peer-1's store differs from peer-0's at title: "" vs "hello"`,
      ].join("\n"),
    );
    expect((error as ConvergenceError).seed).toBe(9);
  });

  it("says how many updates were dropped since the last heal", async () => {
    const [, yjs] = backends[0];
    network = createNetwork({ seed: 10, dropRate: 1 });
    const first = todoPeer(yjs, 0);
    const second = todoPeer(yjs, 1, { connect: false });
    network.addPeer(first.setup);
    network.addPeer(second.setup);
    await network.settle();
    network.peers[1].engine.connect();
    const differences = (left: string, right: string) => [
      "2 peers did not converge (seed 10):",
      `- peer-1's document differs from peer-0's at title: "${left}" vs "${right}"`,
      `- peer-1's store differs from peer-0's at title: "${left}" vs "${right}"`,
    ];

    first.store.setState({ title: "dropped" });
    await network.settle();
    expect(() => network?.expectConverged()).toThrow(
      [
        ...differences("", "dropped"),
        "1 update was dropped: heal() and settle() until stats().dropped stops growing.",
      ].join("\n"),
    );

    network.heal();
    await network.settle();
    network.expectConverged();
    first.store.setState({ title: "again" });
    first.store.setState({ title: "and again" });
    await network.settle();
    expect(() => network?.expectConverged()).toThrow(
      [
        ...differences("dropped", "and again"),
        "2 updates were dropped since the last heal(): heal() and settle() until stats().dropped stops growing.",
      ].join("\n"),
    );
  });

  it("says how many messages are still on their way", async () => {
    const [, yjs] = backends[0];
    const { network, stores } = createTodoNetwork(yjs, 2, {
      seed: 12,
      latency: 10,
    });
    await network.settle();

    stores[0].setState({ title: "on its way" });
    expect(() => network.expectConverged()).toThrow(
      [
        "2 peers did not converge (seed 12):",
        `- peer-1's document differs from peer-0's at title: "" vs "on its way"`,
        `- peer-1's store differs from peer-0's at title: "" vs "on its way"`,
        "1 message is still on its way: settle() delivers it.",
      ].join("\n"),
    );
  });

  it("leaves the keys a peer's config omits out of what converges", async () => {
    const [, yjs] = backends[0];
    network = createNetwork({ seed: 11 });
    const peers = [0, 1].map((index) =>
      todoPeer(yjs, index, { config: { omit: ["title"] } }),
    );
    for (const { setup } of peers) network.addPeer(setup);
    await network.settle();

    peers[0].store.setState({ title: "mine" });
    peers[1].store.setState({ todos: [{ title: "milk", done: false }] });
    await network.settle();

    network.expectConverged();
    expect(peers[0].store.getState()).toMatchObject({
      title: "mine",
      todos: [{ title: "milk", done: false }],
    });
    expect(peers[1].store.getState().title).toBe("");
  });

  it("waits for stores that notify asynchronously", async () => {
    const [, yjs] = backends[0];
    network = createNetwork({ seed: 10 });
    const stores = [0, 1].map((index) => {
      const { store, setup } = todoPeer(yjs, index);
      const adapter: StoreAdapter<TodoState> = {
        getState: () => setup.adapter.getState(),
        setState: (state) => setup.adapter.setState(state),
        subscribe: (listener) =>
          store.subscribe(() => {
            setTimeout(listener, 0);
          }),
      };
      network?.addPeer({ ...setup, adapter });
      return store;
    });
    await network.settle();

    stores[0].setState({ title: "later" });
    await network.settle();

    network.expectConverged();
    expect(stores[1].getState().title).toBe("later");
  });
});

describe("the lost key check", () => {
  /** Two stand-in peers, settled, whose first sends its next update early. */
  const createEarlyUpdate = async (options: NetworkOptions = {}) => {
    network = createNetwork({ seed: 15, latency: 10, ...options });
    const [first, second] = [0, 1].map((index) => standInPeer(index));
    network.addPeer(first.setup);
    network.addPeer(second.setup);
    await network.settle();

    // The second update reaches peer-1 first, so its document drops the title until the
    // first one arrives.
    first.doc.holdBack();
    first.store.setState({ title: "draft" });
    first.store.setState({ title: "final" });
    return { network, first, second };
  };

  it("rejects when a peer's store and document lose a synced key", async () => {
    const { network } = await createEarlyUpdate();

    const error: unknown = await network.settle().catch((caught) => caught);

    expect(error).toBeInstanceOf(LostKeyError);
    expect(error).toMatchObject({
      seed: 15,
      peer: "peer-1",
      key: "title",
      at: 20,
      message:
        "peer-1 lost the synced key title at 20 ms (seed 15), on an update from peer-0: its store and document both lack it, and no peer deleted it.",
    });
  });

  it("lets the peer lose the key until the update arrives with checkLostKeys: false", async () => {
    const { network, first, second } = await createEarlyUpdate({
      checkLostKeys: false,
    });

    await network.settle();
    expect(second.store.getState()).not.toHaveProperty("title");

    first.doc.release();
    await network.settle();
    network.expectConverged();
    expect(second.store.getState().title).toBe("final");
  });

  it("leaves out a peer whose engine is disconnected, as its store keeps the key", async () => {
    const { network, second } = await createEarlyUpdate();
    const peer = network.peers[1];
    peer.engine.disconnect();

    await network.settle();

    expect(peer.backend.read()).not.toHaveProperty("title");
    expect(second.store.getState().title).toBe("");
  });
});

describe.each([["a stand-in", createStandIn] as const, ...backends])(
  "the lost key check on %s",
  (_name, docs) => {
    it("leaves out a top-level key a peer deleted, on its way to the others", async () => {
      const { network, stores } = createTodoNetwork(docs, 3, {
        seed: 16,
        latency: [1, 20],
      });
      await network.settle();

      const state: Partial<TodoState> = { ...stores[0].getState() };
      delete state.meta;
      stores[0].setState(state as TodoState, true);
      await network.settle();

      network.expectConverged();
      expect(stores[2].getState()).not.toHaveProperty("meta");
    });

    it("leaves out a key a peer's filter rejects, as its store keeps its own", async () => {
      network = createNetwork({ seed: 17, latency: 5 });
      const writer = todoPeer(docs, 0);
      network.addPeer(writer.setup);
      await network.settle();
      // Without a seed, as the reader's own root would compete with the room's on Automerge.
      const reader = todoPeer(docs, 1, {
        config: { filter: (key) => key !== "title", seed: false },
      });
      const peer = network.addPeer(reader.setup);
      await network.settle();

      writer.store.setState({ title: "secret" });
      await network.settle();

      expect(reader.store.getState()).toHaveProperty("title", "");
      expect(peer.backend.read()).toHaveProperty("title", "secret");
    });

    it("leaves out a key the store had before joining but its document never held", async () => {
      network = createNetwork({ seed: 18, latency: 5 });
      const room = todoPeer(docs, 0);
      network.addPeer(room.setup);
      await network.settle();

      const joiner = todoPeer(docs, 1, { config: { seed: false } });
      joiner.store.setState({ extra: "mine" } as Partial<TodoState>);
      network.addPeer(joiner.setup);
      await network.settle();

      expect(joiner.store.getState()).not.toHaveProperty("extra");
    });
  },
);
