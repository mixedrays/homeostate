import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { createZustandAdapter } from "@homeostate/store-zustand";
import {
  createNetwork,
  createRandom,
  LostKeyError,
  randomEdit,
  runRandomized,
  type PeerSetup,
  type RandomAction,
} from "../index";
import { firstDifference, formatPath } from "../compare";
import {
  backends,
  createStandIn,
  textPolicies,
  todoPeer,
  withText,
  type TodoState,
} from "./helpers";

type CountedState = { items: number[] } & Record<string, unknown>;

/** A store whose subscriber keeps `seen_p<index>`, a key no other peer writes, at the item count. */
const countingPeer = (
  docs: (typeof backends)[number][1],
  index: number,
): PeerSetup<CountedState> => {
  const own = `seen_p${index}`;
  const store = createStore<CountedState>(() => ({
    items: [],
    seen_p0: 0,
    seen_p1: 0,
    seen_p2: 0,
  }));
  store.subscribe((state) => {
    if (state[own] !== state.items.length)
      store.setState({ [own]: state.items.length });
  });
  return { adapter: createZustandAdapter(store), ...docs(index) };
};

const addItem: RandomAction<CountedState> = (peer, random) => {
  const state = peer.adapter.getState();
  peer.adapter.setState({
    ...state,
    items: [...state.items, random.int(100)],
  });
};

describe.each(backends)("randomized runs on %s", (_name, docs) => {
  it.each(textPolicies)(
    "converge with latency, reordering and drops, with %s",
    async (_policy, text) => {
      await runRandomized({
        seed: 11,
        peers: 3,
        steps: 150,
        createPeer: (index) => todoPeer(withText(docs, text), index).setup,
        network: { latency: [0, 20], reorder: true, dropRate: 0.1 },
      });
    },
  );

  it("converge when a store writes in answer to the final heal and drops are frequent", async () => {
    // Applying the documents the heal exchanges makes each store update its count, and those
    // updates can be dropped too; one heal would leave the peers apart.
    await runRandomized<CountedState>({
      seed: 1,
      peers: 3,
      steps: 60,
      actions: [addItem],
      linkChangeRate: 0,
      network: { latency: [0, 20], dropRate: 0.3 },
      createPeer: (index) => countingPeer(docs, index),
    });
  });
});

describe("runRandomized", () => {
  const [, yjs] = backends[0];

  it("names the seed of a run whose peers do not converge", async () => {
    // Peer 1 never connects its engine, so its store never follows its document.
    const run = runRandomized({
      seed: 12,
      steps: 40,
      createPeer: (index) =>
        todoPeer(yjs, index, { connect: index !== 1 }).setup,
    });

    await expect(run).rejects.toThrow(
      /^Randomized run failed after 40 steps; pass `seed: 12` to replay it\.\n3 peers did not converge \(seed 12\):\n- peer-1's store differs from peer-0's/,
    );
  });

  it("says when updates were still being dropped after the last round of healing", async () => {
    // Each peer keeps its own count one above the other's: every count a peer receives makes it
    // write a new one, until an update is dropped, and every heal brings that update back.
    const leapfrog = (index: number): PeerSetup<Record<string, number>> => {
      const [own, other] = index === 0 ? ["n0", "n1"] : ["n1", "n0"];
      const store = createStore<Record<string, number>>(() => ({ [own]: 0 }));
      store.subscribe((state) => {
        if (state[other] !== undefined && state[other] >= state[own])
          store.setState({ [own]: state[other] + 1 });
      });
      return { adapter: createZustandAdapter(store), ...yjs(index) };
    };

    const error: unknown = await runRandomized({
      seed: 15,
      peers: 2,
      steps: 1,
      linkChangeRate: 0,
      actions: [() => {}],
      network: { dropRate: 0.5 },
      createPeer: leapfrog,
    }).catch((caught) => caught);

    expect((error as Error).message).toMatch(
      /^Randomized run failed after 1 steps; pass `seed: 15` to replay it\.\n2 peers did not converge \(seed 15\):\n- peer-1's document differs from peer-0's at n\d: /,
    );
    expect((error as Error).message).toMatch(
      /\nUpdates were still being dropped after 10 rounds of heal\(\) and settle\(\): does a store write in answer to every exchange\?$/,
    );
  });

  it("names the step that threw", async () => {
    let calls = 0;
    const failing: RandomAction<TodoState> = () => {
      if (++calls === 5) throw new Error("broken action");
    };

    await expect(
      runRandomized({
        seed: 13,
        steps: 20,
        linkChangeRate: 0,
        actions: [failing],
        createPeer: (index) => todoPeer(yjs, index).setup,
      }),
    ).rejects.toThrow(
      "Randomized run failed at step 5 of 20; pass `seed: 13` to replay it.\nbroken action",
    );
  });

  it("names the step and seed of a run in which a peer lost a synced key", async () => {
    const run = async () => {
      const steps: string[] = [];
      const recordEdit: RandomAction<TodoState> = (peer, random) => {
        steps.push(peer.name);
        randomEdit(peer, random);
      };
      const error: unknown = await runRandomized({
        seed: 19,
        steps: 150,
        actions: [recordEdit],
        createPeer: (index) => todoPeer(createStandIn, index).setup,
        network: { latency: [0, 20], dropRate: 0.05 },
      }).catch((caught) => caught);
      return { error, steps };
    };

    const first = await run();
    const replay = await run();

    expect((first.error as Error).message).toBe(
      [
        "Randomized run failed at step 14 of 150; pass `seed: 19` to replay it.",
        "peer-2 lost the synced key todos at 52.46 ms (seed 19), on an update from peer-1: its store and document both lack it, and no peer deleted it.",
      ].join("\n"),
    );
    expect(first.error).toMatchObject({ cause: expect.any(LostKeyError) });
    expect((replay.error as Error).message).toBe(
      (first.error as Error).message,
    );
    expect(replay.steps).toEqual(first.steps);
  });
});

describe("randomEdit", () => {
  it("changes the store's synced keys, keeping its keys and actions", async () => {
    const [, yjs] = backends[0];
    const network = createNetwork({ seed: 14 });
    const { store, setup } = todoPeer(yjs, 0);
    const add = () => {};
    store.setState({ add } as Partial<TodoState>);
    const peer = network.addPeer(setup);
    const random = createRandom(14);
    const before = JSON.stringify(peer.syncedState());

    for (let i = 0; i < 50; i++) randomEdit(peer, random);

    const state = store.getState() as TodoState & { add: () => void };
    expect(Object.keys(state).sort()).toEqual([
      "add",
      "meta",
      "title",
      "todos",
    ]);
    expect(state.add).toBe(add);
    expect(JSON.stringify(peer.syncedState())).not.toBe(before);
    network.destroy();
  });
});

describe("createRandom", () => {
  it("gives the same numbers for the same seed", () => {
    const draw = (seed: number) => {
      const random = createRandom(seed);
      return Array.from({ length: 5 }, () => random.next());
    };
    expect(draw(1)).toEqual(draw(1));
    expect(draw(1)).not.toEqual(draw(2));
  });

  it("keeps integers and picks in range", () => {
    const random = createRandom(3);
    for (let i = 0; i < 100; i++) {
      const value = random.int(4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
      expect(["a", "b"]).toContain(random.pick(["a", "b"]));
    }
    expect(() => random.pick([])).toThrow("Cannot pick from an empty list.");
  });
});

describe("firstDifference", () => {
  it("finds the first differing path", () => {
    expect(firstDifference({ a: [1, 2] }, { a: [1, 3] })).toEqual({
      path: ["a", 1],
      left: 2,
      right: 3,
    });
    expect(firstDifference({ a: [1] }, { a: [1, 2] })).toEqual({
      path: ["a", 1],
      left: undefined,
      right: 2,
    });
    expect(firstDifference({ a: 1 }, { b: 1 })).toEqual({
      path: ["a"],
      left: 1,
      right: undefined,
    });
    expect(firstDifference({ a: { b: "x" } }, { a: { b: "x" } })).toBeNull();
  });

  it("formats paths as they read in code", () => {
    expect(formatPath([])).toBe("the root");
    expect(formatPath(["todos", 0, "title"])).toBe("todos[0].title");
    expect(formatPath(["odd key"])).toBe('["odd key"]');
  });
});
