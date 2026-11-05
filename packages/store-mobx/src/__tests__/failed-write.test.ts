import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autorun,
  configure,
  observable,
  onReactionError,
  runInAction,
} from "mobx";
import { createSyncEngine } from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { createMobxAdapter } from "../index.js";

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

const disposers: (() => void)[] = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});

const connect = (backend: MemoryBackend) => {
  const store = observable({ count: 0 });
  const engine = createSyncEngine(backend, createMobxAdapter(store));
  engine.connect();
  disposers.push(() => engine.disconnect());
  const increment = () =>
    runInAction(() => {
      store.count++;
    });
  return { engine, increment };
};

/** Counts the runs of an `autorun` on an observable no store touches. */
const watchUnrelatedReaction = () => {
  const box = observable.box(0);
  let runs = 0;
  disposers.push(
    autorun(() => {
      box.get();
      runs++;
    }),
  );
  return {
    poke: () => runInAction(() => box.set(box.get() + 1)),
    runs: () => runs,
  };
};

/**
 * Fails one write, then makes another change, and one in an engine of its own, and pokes an
 * unrelated reaction: what MobX's global state being intact keeps working.
 */
const failOneWrite = () => {
  const { backend, failNextWrite } = createFailingBackend();
  const { engine, increment } = connect(backend);
  const other = createMemoryBackend();
  const { increment: incrementOther } = connect(other);
  const unrelated = watchUnrelatedReaction();

  failNextWrite();
  expect(increment).not.toThrow();
  const failure = engine.getStatus().failure;
  increment();
  incrementOther();
  unrelated.poke();

  return { backend, engine, other, unrelated, failure };
};

describe("a failed write without onError", () => {
  describe("with MobX's error boundaries", () => {
    it("is logged and handed to onReactionError by MobX", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const handler = vi.fn();
      disposers.push(onReactionError(handler));

      const { failure } = failOneWrite();

      expect(failure).toEqual({ error: boom, source: "backend" });
      expect(handler).toHaveBeenCalledWith(boom, expect.anything());
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("[mobx]"),
        boom,
      );
    });

    it("writes the next change and leaves other reactions running", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { backend, engine, other, unrelated } = failOneWrite();

      expect(backend.read()).toEqual({ count: 2 });
      expect(engine.getStatus().failure).toBeNull();
      expect(other.read()).toEqual({ count: 1 });
      expect(unrelated.runs()).toBe(2);
    });
  });

  describe("with MobX's error boundaries disabled", () => {
    afterEach(() => {
      configure({ disableErrorBoundaries: false });
    });

    it("is logged, writes the next change and leaves other reactions running", () => {
      configure({ disableErrorBoundaries: true });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { backend, engine, other, unrelated, failure } = failOneWrite();

      expect(failure).toEqual({ error: boom, source: "backend" });
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("[homeostate]"),
        boom,
      );
      expect(backend.read()).toEqual({ count: 2 });
      expect(engine.getStatus().failure).toBeNull();
      expect(other.read()).toEqual({ count: 1 });
      expect(unrelated.runs()).toBe(2);
    });
  });
});
