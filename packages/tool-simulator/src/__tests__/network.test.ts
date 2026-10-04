import { afterEach, describe, expect, it } from "vitest";
import type { PersistableDoc, StoreAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import {
  ConvergenceError,
  createNetwork,
  type Network,
  type NetworkOptions,
} from "../index";
import { backends, todoPeer, type TodoState } from "./helpers";

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
