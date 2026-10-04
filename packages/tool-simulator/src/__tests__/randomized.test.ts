import { describe, expect, it } from "vitest";
import {
  createNetwork,
  createRandom,
  randomEdit,
  runRandomized,
  type RandomAction,
} from "../index";
import { firstDifference, formatPath } from "../compare";
import {
  backends,
  textPolicies,
  todoPeer,
  withText,
  type TodoState,
} from "./helpers";

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
