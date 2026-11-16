import { afterEach, describe, expect, it, vi } from "vitest";
import { autorun, observable, runInAction } from "mobx";
import { destroy, types } from "mobx-state-tree";
import { createSyncEngine } from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { createMobxStateTreeAdapter, syncStateTree } from "../index.js";

const Counter = types.model("Counter", { count: 0 }).actions((self) => ({
  increment() {
    self.count++;
  },
}));

const boom = new Error("boom");

/** A memory backend whose next `write` throws `boom` once `failNextWrite()` is called. */
const createFailingBackend = () => {
  const backend = createMemoryBackend();
  let fail = false;
  const failing: MemoryBackend = {
    ...backend,
    write: (next, previous) => {
      if (fail) {
        fail = false;
        throw boom;
      }
      backend.write(next, previous);
    },
  };
  return {
    backend: failing,
    failNextWrite: () => {
      fail = true;
    },
  };
};

/** Counts the runs of an `autorun` on an observable no store touches, until it is disposed. */
const watchUnrelatedReaction = () => {
  const box = observable.box(0);
  let runs = 0;
  const dispose = autorun(() => {
    box.get();
    runs++;
  });
  return {
    poke: () => runInAction(() => box.set(box.get() + 1)),
    runs: () => runs,
    dispose,
  };
};

const disposers: (() => void)[] = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

describe("a failed write without onError", () => {
  describe("with createMobxStateTreeAdapter", () => {
    const connect = (backend: MemoryBackend) => {
      const node = Counter.create();
      const engine = createSyncEngine({
        backend,
        adapter: createMobxStateTreeAdapter(node),
      });
      engine.connect();
      disposers.push(() => engine.disconnect());
      return { node, engine };
    };

    it("returns normally, logs the error and keeps it as the failure", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const { node, engine } = connect(backend);

      failNextWrite();
      node.increment();

      expect(node.count).toBe(1);
      expect(backend.read()).toEqual({ count: 0 });
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("[homeostate]"),
        boom,
      );
      expect(engine.getStatus().failure).toEqual({
        error: boom,
        source: "backend",
      });
    });

    it("writes the next change", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const { node, engine } = connect(backend);

      failNextWrite();
      node.increment();
      node.increment();

      expect(backend.read()).toEqual({ count: 2 });
      expect(engine.getStatus().connected).toBe(true);
      expect(engine.getStatus().failure).toBeNull();
    });

    it("leaves another engine in the process syncing", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const { node } = connect(backend);
      const other = createMemoryBackend();
      const { node: otherNode } = connect(other);

      failNextWrite();
      node.increment();
      otherNode.increment();

      expect(other.read()).toEqual({ count: 1 });
    });

    it("leaves an unrelated MobX reaction running", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const { node } = connect(backend);
      const unrelated = watchUnrelatedReaction();
      disposers.push(unrelated.dispose);

      failNextWrite();
      node.increment();
      unrelated.poke();

      expect(unrelated.runs()).toBe(2);
    });

    it("writes nothing for a node destroyed while subscribed, and leaves MobX running", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const { node } = connect(backend);
      const unrelated = watchUnrelatedReaction();
      disposers.push(unrelated.dispose);

      failNextWrite();
      node.increment();
      destroy(node);
      unrelated.poke();

      expect(backend.read()).toEqual({ count: 0 });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(unrelated.runs()).toBe(2);
    });
  });

  describe("with syncStateTree", () => {
    it("writes the next change and leaves another node syncing", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const node = Counter.create();
      const engine = syncStateTree(node, { backend });
      const other = createMemoryBackend();
      const otherNode = Counter.create();
      syncStateTree(otherNode, { backend: other });
      disposers.push(
        () => destroy(node),
        () => destroy(otherNode),
      );

      failNextWrite();
      node.increment();
      node.increment();
      otherNode.increment();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("[homeostate]"),
        boom,
      );
      expect(backend.read()).toEqual({ count: 2 });
      expect(engine.getStatus().connected).toBe(true);
      expect(other.read()).toEqual({ count: 1 });
    });

    it("disconnects a node destroyed after a failed write", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { backend, failNextWrite } = createFailingBackend();
      const node = Counter.create();
      const engine = syncStateTree(node, { backend });

      failNextWrite();
      node.increment();
      destroy(node);

      expect(engine.getStatus().connected).toBe(false);
      expect(backend.read()).toEqual({ count: 0 });
    });
  });
});
