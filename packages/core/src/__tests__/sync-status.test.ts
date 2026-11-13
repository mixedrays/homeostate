import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  createSyncEngine,
  WriteLoopError,
  type SyncEngine,
  type SyncEngineConfig,
  type SyncEvent,
  type SyncStatus,
} from "../index.js";
import { createMemoryBackend, type MemoryBackend } from "../testing.js";
import { createTestStore, type TestStore } from "./helpers.js";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Lets every promise reaction already due run. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Records each sync event of `engine`, with the status it reads as the event arrives. */
const record = (engine: SyncEngine): [SyncEvent, SyncStatus][] => {
  const seen: [SyncEvent, SyncStatus][] = [];
  engine.subscribe((event) => seen.push([event, engine.getStatus()]));
  return seen;
};

describe("sync status", () => {
  describe("getStatus", () => {
    it("is disconnected until connect, ready after it, and disconnected again after disconnect", () => {
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
      });

      expect(engine.getStatus()).toEqual({
        connected: false,
        ready: false,
        failure: null,
      });

      engine.connect();
      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: true,
        failure: null,
      });

      engine.disconnect();
      expect(engine.getStatus()).toEqual({
        connected: false,
        ready: false,
        failure: null,
      });
    });

    it("is connected and not ready during a wait for ready, then ready", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ready: ready.promise,
      });

      engine.connect();
      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: false,
        failure: null,
      });

      ready.resolve();
      await settled();
      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: true,
        failure: null,
      });
    });

    it("returns the same object until a field changes", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({ backend, adapter: store.adapter });
      const before = engine.getStatus();
      expect(engine.getStatus()).toBe(before);

      engine.connect();
      const connected = engine.getStatus();
      expect(connected).not.toBe(before);

      store.setState({ count: 1 });
      backend.receive({ count: 2 });
      expect(engine.getStatus()).toBe(connected);
    });

    it("returns to the same object when the fields return, so a reconnect re-renders nothing", () => {
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
      });
      engine.connect();
      const connected = engine.getStatus();

      engine.disconnect();
      engine.connect();

      expect(engine.getStatus()).toBe(connected);
    });

    it("cannot be changed by whoever reads it, whatever it says", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ready: ready.promise,
      });
      expect(Object.isFrozen(engine.getStatus())).toBe(true);

      engine.connect();
      expect(Object.isFrozen(engine.getStatus())).toBe(true);

      ready.resolve();
      await settled();
      expect(engine.getStatus().ready).toBe(true);
      expect(Object.isFrozen(engine.getStatus())).toBe(true);
    });
  });

  describe("sync events", () => {
    it("come with every change of the status, which each listener already reads", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ready: () => ready.promise,
      });
      const seen = record(engine);

      engine.connect();
      ready.resolve();
      await settled();
      engine.disconnect();

      expect(seen).toEqual([
        ["connect", { connected: true, ready: false, failure: null }],
        ["ready", { connected: true, ready: true, failure: null }],
        ["disconnect", { connected: false, ready: false, failure: null }],
      ]);
    });

    it("leave the status the same object for local and remote changes", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({ backend, adapter: store.adapter });
      engine.connect();
      const status = engine.getStatus();
      const seen = record(engine);

      store.setState({ count: 1 });
      backend.receive({ count: 2 });

      expect(seen).toEqual([
        ["local", status],
        ["remote", status],
      ]);
      expect(seen[0]![1]).toBe(status);
      expect(seen[1]![1]).toBe(status);
    });

    it("send nothing for a connect or disconnect that changes nothing", () => {
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
      });
      const seen = record(engine);

      engine.disconnect();
      engine.connect();
      engine.connect();

      expect(seen.map(([event]) => event)).toEqual(["connect"]);
    });
  });

  describe.each([
    ["with onError", true],
    ["without onError", false],
  ])("failures once connected, %s", (_name, withOnError) => {
    /** The engine's options, and what reached `onError`. */
    const options = () => {
      const reported: [unknown, unknown][] = [];
      const onError = (error: unknown, source: unknown) => {
        reported.push([error, source]);
      };
      return { reported, config: withOnError ? { onError } : {} };
    };

    /** Runs `work`, which throws what the engine does not hand to `onError`. */
    const attempt = (work: () => void): void => {
      try {
        work();
      } catch {
        expect(withOnError).toBe(false);
      }
    };

    it("records a failed write and clears it when the next local change is written", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      const seen: [SyncEvent, unknown][] = [];
      engine.subscribe((event) =>
        seen.push([event, engine.getStatus().failure]),
      );
      const write = backend.write;
      const error = new Error("write");
      backend.write = () => {
        throw error;
      };

      attempt(() => store.setState({ count: 1 }));

      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: true,
        failure: { error, source: "backend" },
      });
      expect(seen).toEqual([["error", { error, source: "backend" }]]);

      backend.write = write;
      store.setState({ count: 2 });

      expect(engine.getStatus().failure).toBeNull();
      expect(seen.at(-1)).toEqual(["local", null]);
    });

    it("records a failed apply and clears it when the next remote change is applied", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      const setState = store.adapter.setState;
      const error = new Error("setState");
      store.adapter.setState = () => {
        throw error;
      };

      attempt(() => backend.receive({ count: 1 }));

      expect(engine.getStatus().failure).toEqual({ error, source: "store" });

      store.adapter.setState = setState;
      backend.receive({ count: 2 });

      expect(engine.getStatus().failure).toBeNull();
    });

    it("clears a failed apply when a local change is written after it", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      const setState = store.adapter.setState;
      store.adapter.setState = () => {
        throw new Error("setState");
      };
      attempt(() => backend.receive({ count: 1 }));
      store.adapter.setState = setState;

      store.setState({ count: 2 });

      expect(engine.getStatus().failure).toBeNull();
      expect(backend.read()).toEqual({ count: 2 });
    });

    it("clears a failed write when a remote change is applied after it", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      const write = backend.write;
      backend.write = () => {
        throw new Error("write");
      };
      attempt(() => store.setState({ count: 1 }));
      backend.write = write;

      backend.receive({ count: 2 });

      expect(engine.getStatus().failure).toBeNull();
      expect(store.getState()).toEqual({ count: 2 });
    });

    it("returns to the same object when a failure is set and cleared", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      const before = engine.getStatus();
      const write = backend.write;
      backend.write = () => {
        throw new Error("write");
      };
      attempt(() => store.setState({ count: 1 }));
      backend.write = write;
      store.setState({ count: 2 });

      expect(engine.getStatus()).toBe(before);
    });

    it("keeps the same object while a failure stands", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      backend.write = () => {
        throw new Error("write");
      };
      attempt(() => store.setState({ count: 1 }));

      expect(engine.getStatus()).toBe(engine.getStatus());
      expect(Object.isFrozen(engine.getStatus())).toBe(true);
    });

    it("keeps a failure after disconnect, and clears it on connect", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
      });
      engine.connect();
      const write = backend.write;
      const error = new Error("write");
      backend.write = () => {
        throw error;
      };
      attempt(() => store.setState({ count: 1 }));
      backend.write = write;

      engine.disconnect();
      expect(engine.getStatus()).toEqual({
        connected: false,
        ready: false,
        failure: { error, source: "backend" },
      });

      engine.connect();
      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: true,
        failure: null,
      });
    });

    it("sends error with the failure before onError runs", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const order: string[] = [];
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...(withOnError ? { onError: () => order.push("onError") } : {}),
      });
      engine.connect();
      engine.subscribe((event) =>
        order.push(`${event}: ${engine.getStatus().failure?.source}`),
      );
      backend.write = () => {
        throw new Error("write");
      };

      attempt(() => store.setState({ count: 1 }));

      expect(order).toEqual(
        withOnError ? ["error: backend", "onError"] : ["error: backend"],
      );
    });

    it("records what filter throws, with no source, and it still propagates", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const error = new Error("filter");
      let failing = false;
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
        filter: () => {
          if (failing) throw error;
          return true;
        },
      });
      engine.connect();
      failing = true;

      expect(() => backend.receive({ count: 1 })).toThrow(error);

      expect(engine.getStatus().failure).toEqual({ error });
    });

    it("records what schedule throws, with no source, and it still propagates", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const error = new Error("schedule");
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
        schedule: () => {
          throw error;
        },
      });
      engine.connect();

      expect(() => backend.receive({ count: 1 })).toThrow(error);

      expect(engine.getStatus().failure).toEqual({ error });
    });

    it("sends error for a pending apply that fails in disconnect, then disconnect", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const { config } = options();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
        schedule: () => {},
      });
      engine.connect();
      const error = new Error("setState");
      store.adapter.setState = () => {
        throw error;
      };
      const seen = record(engine);
      backend.receive({ count: 1 });

      attempt(() => engine.disconnect());

      const failure = { error, source: "store" };
      expect(seen).toEqual([
        ["error", { connected: true, ready: true, failure }],
        ["disconnect", { connected: false, ready: false, failure }],
      ]);
    });
  });

  describe.each([
    ["with onError", true],
    ["without onError", false],
  ])("failed connects, %s", (_name, withOnError) => {
    const config = withOnError ? { onError: () => {} } : {};

    it("sends error for what connect throws, and a later connect clears it", () => {
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
      });
      const getState = store.adapter.getState;
      const error = new Error("getState");
      store.adapter.getState = () => {
        throw error;
      };
      const seen = record(engine);

      expect(() => engine.connect()).toThrow(error);

      expect(seen).toEqual([
        [
          "error",
          {
            connected: false,
            ready: false,
            failure: { error, source: "store" },
          },
        ],
      ]);

      store.adapter.getState = getState;
      engine.connect();

      expect(seen.at(-1)).toEqual([
        "connect",
        { connected: true, ready: true, failure: null },
      ]);
    });

    it("names the backend when its subscribe throws", () => {
      const backend = createMemoryBackend();
      const error = new Error("subscribe");
      backend.subscribe = () => {
        throw error;
      };
      const engine = createSyncEngine({
        backend,
        adapter: createTestStore({ count: 0 }).adapter,
        ...config,
      });

      expect(() => engine.connect()).toThrow(error);

      expect(engine.getStatus().failure).toEqual({ error, source: "backend" });
    });

    it("names the store when its subscribe throws", () => {
      const store = createTestStore({ count: 0 });
      const error = new Error("subscribe");
      store.adapter.subscribe = () => {
        throw error;
      };
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
      });

      expect(() => engine.connect()).toThrow(error);

      expect(engine.getStatus().failure).toEqual({ error, source: "store" });
    });

    it("records a ready function that throws, and a later connect clears it", async () => {
      const store = createTestStore({ count: 0 });
      const error = new Error("ready");
      let failing = true;
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
        ready: () => {
          if (failing) throw error;
          return Promise.resolve();
        },
      });

      expect(() => engine.connect()).toThrow(error);

      expect(engine.getStatus()).toEqual({
        connected: false,
        ready: false,
        failure: { error, source: "ready" },
      });

      failing = false;
      engine.connect();
      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: false,
        failure: null,
      });

      await settled();
      expect(engine.getStatus().ready).toBe(true);
    });

    it("gives what filter throws in connect no source, even after a failure that had one", () => {
      const store = createTestStore({ count: 0 });
      const getState = store.adapter.getState;
      store.adapter.getState = () => {
        throw new Error("getState");
      };
      const error = new Error("filter");
      let filtering = false;
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
        filter: () => {
          if (filtering) throw error;
          return true;
        },
      });
      expect(() => engine.connect()).toThrow();
      store.adapter.getState = getState;
      filtering = true;

      expect(() => engine.connect()).toThrow(error);

      expect(engine.getStatus().failure).toEqual({ error });
    });
  });

  describe.each([
    ["with onError", true],
    ["without onError", false],
  ])("failed waits for ready, %s", (_name, withOnError) => {
    const config = withOnError ? { onError: () => {} } : {};

    /** Runs `work`, whose failure without `onError` is an unhandled rejection. */
    const expectingRejection = async (
      error: unknown,
      work: () => void,
    ): Promise<void> => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      work();
      await settled();
      await settled();
      process.off("unhandledRejection", onUnhandled);
      expect(unhandled).toEqual(withOnError ? [] : [error]);
    };

    it("records a rejected ready as one change, sent with disconnect and then error, and a later connect clears it while it waits", async () => {
      const store = createTestStore({ count: 0 });
      const first = deferred();
      const waits = [first, deferred()];
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
        ready: () => waits.shift()!.promise,
      });
      engine.connect();
      const seen = record(engine);
      const error = new Error("ready");

      await expectingRejection(error, () => first.reject(error));

      const failure = { error, source: "ready" };
      expect(seen).toEqual([
        ["disconnect", { connected: false, ready: false, failure }],
        ["error", { connected: false, ready: false, failure }],
      ]);
      expect(seen[1]![1]).toBe(seen[0]![1]);

      engine.connect();
      expect(engine.getStatus()).toEqual({
        connected: true,
        ready: false,
        failure: null,
      });
    });

    it("shows that a ready rejected with no reason failed", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
        ready: ready.promise,
      });
      engine.connect();

      await expectingRejection(undefined, () => ready.reject());

      expect(engine.getStatus().failure).toEqual({
        error: undefined,
        source: "ready",
      });
    });

    it("shows the failure to disconnect and then error listeners, before onError runs", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const seen: unknown[] = [];
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...(withOnError ? { onError: () => seen.push("onError") } : {}),
        ready: ready.promise,
      });
      engine.connect();
      engine.subscribe((event) =>
        seen.push([event, engine.getStatus().failure]),
      );
      const error = new Error("ready");

      await expectingRejection(error, () => ready.reject(error));

      const failure = { error, source: "ready" };
      const events = [
        ["disconnect", failure],
        ["error", failure],
      ];
      expect(seen).toEqual(withOnError ? [...events, "onError"] : events);
    });

    it("records a reconcile that fails at settling as one change", async () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
        ready: ready.promise,
      });
      engine.connect();
      const error = new Error("seed");
      backend.write = () => {
        throw error;
      };
      const seen = record(engine);

      await expectingRejection(error, () => ready.resolve());

      const status = {
        connected: false,
        ready: false,
        failure: { error, source: "backend" },
      };
      expect(seen).toEqual([
        ["disconnect", status],
        ["error", status],
      ]);
    });

    it("records a pending apply that fails at settling as one change", async () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
        schedule: () => {},
        ready: ready.promise,
      });
      engine.connect();
      const error = new Error("setState");
      store.adapter.setState = () => {
        throw error;
      };
      backend.receive({ count: 1 });
      const seen = record(engine);

      await expectingRejection(error, () => ready.resolve());

      const status = {
        connected: false,
        ready: false,
        failure: { error, source: "store" },
      };
      expect(seen).toEqual([
        ["disconnect", status],
        ["error", status],
      ]);
    });

    it("records nothing for a wait a failed connect abandoned", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
        ready: ready.promise,
      });
      const getState = store.adapter.getState;
      const error = new Error("getState");
      store.adapter.getState = () => {
        throw error;
      };
      expect(() => engine.connect()).toThrow(error);
      store.adapter.getState = getState;
      const seen = record(engine);

      ready.reject(new Error("late"));
      await settled();

      expect(seen).toEqual([]);
      expect(engine.getStatus().failure).toEqual({ error, source: "store" });
    });

    it("records nothing for a rejection after disconnect", async () => {
      const store = createTestStore({ count: 0 });
      const ready = deferred();
      const engine = createSyncEngine({
        backend: createMemoryBackend(),
        adapter: store.adapter,
        ...config,
        ready: ready.promise,
      });
      engine.connect();
      engine.disconnect();
      const seen = record(engine);

      ready.reject(new Error("late"));
      await settled();

      expect(seen).toEqual([]);
      expect(engine.getStatus().failure).toBeNull();
    });
  });

  it("clears a failed apply during a wait for ready once the wait ends well", async () => {
    const backend = createMemoryBackend();
    const store = createTestStore({ count: 0 });
    const ready = deferred();
    const engine = createSyncEngine({
      backend,
      adapter: store.adapter,
      onError: () => {},
      ready: ready.promise,
    });
    engine.connect();
    const setState = store.adapter.setState;
    store.adapter.setState = () => {
      throw new Error("setState");
    };
    backend.receive({ count: 1 });
    store.adapter.setState = setState;
    expect(engine.getStatus()).toMatchObject({
      connected: true,
      ready: false,
      failure: { source: "store" },
    });
    const seen = record(engine);

    ready.resolve();
    await settled();

    expect(seen).toEqual([
      ["ready", { connected: true, ready: true, failure: null }],
    ]);
  });

  describe.each([
    ["with onError in development", true, false],
    ["without onError in development", false, false],
    ["without onError in production", false, true],
  ])("write loops, %s", (_name, withOnError, production) => {
    /** A store that bumps `count` whenever it is applied to, while `normalising`. */
    const loopingStore = () => {
      let normalising = true;
      const store = createTestStore({ count: 0 }, (state) =>
        normalising ? { count: state.count + 1000 } : state,
      );
      return {
        store,
        startNormalising: () => (normalising = true),
        stopNormalising: () => (normalising = false),
      };
    };

    let warn: MockInstance;
    beforeEach(() => {
      warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      if (production) vi.stubEnv("NODE_ENV", "production");
    });
    afterEach(() => {
      warn.mockRestore();
      vi.unstubAllEnvs();
    });

    const start = () => {
      const backend = createMemoryBackend();
      const { store, startNormalising, stopNormalising } = loopingStore();
      const reported: unknown[] = [];
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...(withOnError ? { onError: (error) => reported.push(error) } : {}),
      });
      engine.connect();
      return {
        backend,
        store,
        startNormalising,
        stopNormalising,
        reported,
        engine,
      };
    };

    /**
     * Remote changes that make the store rewrite what it just rewrote, enough for the engine to
     * stop writing it back.
     */
    const loop = (backend: MemoryBackend, times = 7): void => {
      for (let i = 1; i <= times; i++) backend.receive({ count: i * 7 });
    };

    it("records the loop in every build, shown by the remote that stopped it and then sent as error, and stays connected", () => {
      const { backend, engine } = start();
      const seen = record(engine);

      loop(backend);

      const status = engine.getStatus();
      expect(status.failure?.error).toBeInstanceOf(WriteLoopError);
      expect(status.failure?.source).toBe("store");
      expect(status.connected).toBe(true);
      expect(status.ready).toBe(true);
      const stopped = seen.findIndex(([, { failure }]) => failure !== null);
      expect(seen.map(([event]) => event)).toEqual([
        ...Array(stopped + 1).fill("remote"),
        "error",
        ...Array(6 - stopped).fill("remote"),
      ]);
      expect(seen.slice(stopped).every(([, seen]) => seen === status)).toBe(
        true,
      );
    });

    it("keeps the same object while the loop holds, and sends no error again", () => {
      const { backend, engine } = start();
      loop(backend);
      const status = engine.getStatus();
      const seen = record(engine);

      loop(backend);

      expect(engine.getStatus()).toBe(status);
      expect(seen.map(([event]) => event)).toEqual(Array(7).fill("remote"));
    });

    it("leaves what the loop reports as it was", () => {
      const { backend, engine, reported } = start();
      const events: SyncEvent[] = [];
      engine.subscribe((event) => events.push(event));

      loop(backend);

      expect(reported).toHaveLength(withOnError ? 1 : 0);
      expect(warn).toHaveBeenCalledTimes(withOnError || production ? 0 : 1);
      expect(events.filter((event) => event === "remote")).toHaveLength(7);
    });

    it("clears once an apply leaves no loop", () => {
      const { backend, engine, stopNormalising, store } = start();
      loop(backend);
      stopNormalising();

      backend.receive({ count: 99 });

      expect(engine.getStatus().failure).toBeNull();
      expect(store.getState()).toEqual({ count: 99 });
    });

    it("clears when a local change is written", () => {
      const { backend, engine, stopNormalising, store } = start();
      loop(backend);
      stopNormalising();

      store.setState({ count: 5 });

      expect(engine.getStatus().failure).toBeNull();
      expect(backend.read()).toEqual({ count: 5 });
    });

    it("clears on reconnect, and stays through disconnect", () => {
      const { backend, engine, stopNormalising } = start();
      loop(backend);

      engine.disconnect();
      expect(engine.getStatus().failure?.error).toBeInstanceOf(WriteLoopError);

      stopNormalising();
      engine.connect();
      expect(engine.getStatus().failure).toBeNull();
    });

    it("shows a loop that comes back and sends error again, which onError hears of only once", () => {
      const { backend, engine, reported, startNormalising, stopNormalising } =
        start();
      loop(backend);
      stopNormalising();
      backend.receive({ count: 99 });
      expect(engine.getStatus().failure).toBeNull();
      const seen = record(engine);

      startNormalising();
      loop(backend);

      expect(engine.getStatus().failure?.error).toBeInstanceOf(WriteLoopError);
      expect(seen.filter(([event]) => event === "error")).toHaveLength(1);
      expect(reported).toHaveLength(withOnError ? 1 : 0);
    });
  });

  describe("re-entrant calls", () => {
    /** What every observer of `engine` saw that cannot be true. */
    const observe = <S extends object>(
      engine: SyncEngine,
      store: TestStore<S>,
    ) => {
      const violations: string[] = [];
      const check = (where: string) => {
        const { connected, ready } = engine.getStatus();
        if (ready && !connected) violations.push(`ready alone in ${where}`);
      };
      store.adapter.subscribe(() => check("a store subscriber"));
      engine.subscribe((event) => check(`the ${event} event`));
      return violations;
    };

    /** Runs `act` the first time the store notifies; it subscribes after `observe`. */
    const onFirstStoreChange = <S extends object>(
      store: TestStore<S>,
      act: () => void,
    ) => {
      let armed = true;
      store.adapter.subscribe(() => {
        if (!armed) return;
        armed = false;
        act();
      });
    };

    /** An engine waiting for a function `ready`, with the waits it started. */
    const waitingEngine = (
      backend: MemoryBackend,
      store: TestStore<{ count: number }>,
      config: SyncEngineConfig<{ count: number }> = {},
    ) => {
      const waits: ReturnType<typeof deferred>[] = [];
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        ...config,
        ready: () => {
          const wait = deferred();
          waits.push(wait);
          return wait.promise;
        },
      });
      engine.connect();
      return { engine, waits };
    };

    describe("during reconciliation at settling", () => {
      /** A backend change only the reconcile at settling brings to the store. */
      const pendingChange = (backend: MemoryBackend) =>
        backend.write({ count: 2 });

      it("reports no status of ready after a subscriber disconnects", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const { engine, waits } = waitingEngine(backend, store);
        const violations = observe(engine, store);
        onFirstStoreChange(store, () => engine.disconnect());
        const seen = record(engine);
        pendingChange(backend);

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(seen).toEqual([
          ["disconnect", { connected: false, ready: false, failure: null }],
        ]);
      });

      it("stays waiting after a subscriber reconnects", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const { engine, waits } = waitingEngine(backend, store);
        const violations = observe(engine, store);
        onFirstStoreChange(store, () => {
          engine.disconnect();
          engine.connect();
        });
        pendingChange(backend);

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus()).toEqual({
          connected: true,
          ready: false,
          failure: null,
        });

        waits[1]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus().ready).toBe(true);
      });

      it("records a write back that fails after a subscriber disconnected", async () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 }, (state) => ({
          count: state.count + 1000,
        }));
        const { engine, waits } = waitingEngine(backend, store, {
          onError: () => {},
        });
        const violations = observe(engine, store);
        onFirstStoreChange(store, () => engine.disconnect());
        pendingChange(backend);
        const error = new Error("write");
        backend.write = () => {
          throw error;
        };

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus()).toEqual({
          connected: false,
          ready: false,
          failure: { error, source: "backend" },
        });
      });
    });

    describe("during a pending apply at settling", () => {
      const pending = () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const { engine, waits } = waitingEngine(backend, store, {
          schedule: () => {},
        });
        const violations = observe(engine, store);
        backend.receive({ count: 2 });
        return { store, engine, waits, violations };
      };

      it("ends disconnected after a subscriber disconnects", async () => {
        const { store, engine, waits, violations } = pending();
        onFirstStoreChange(store, () => engine.disconnect());

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus()).toEqual({
          connected: false,
          ready: false,
          failure: null,
        });
      });

      it("stays waiting after a subscriber reconnects", async () => {
        const { store, engine, waits, violations } = pending();
        onFirstStoreChange(store, () => {
          engine.disconnect();
          engine.connect();
        });

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus()).toEqual({
          connected: true,
          ready: false,
          failure: null,
        });
      });

      it("ends disconnected after a remote event listener disconnects", async () => {
        const { engine, waits, violations } = pending();
        engine.subscribe((event) => {
          if (event === "remote") engine.disconnect();
        });

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus().connected).toBe(false);
      });
    });

    describe("during connect", () => {
      it("stays consistent when a store subscriber connects during reconciliation", () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const engine = createSyncEngine({ backend, adapter: store.adapter });
        const violations = observe(engine, store);
        onFirstStoreChange(store, () => engine.connect());

        engine.connect();

        expect(violations).toEqual([]);
        expect(engine.getStatus().ready).toBe(true);
      });

      it("does nothing when a store subscriber disconnects during reconciliation, as disconnect() is then a no-op", () => {
        const backend = createMemoryBackend({ count: 1 });
        const store = createTestStore({ count: 0 });
        const engine = createSyncEngine({ backend, adapter: store.adapter });
        const violations = observe(engine, store);
        onFirstStoreChange(store, () => engine.disconnect());

        engine.connect();

        expect(violations).toEqual([]);
        expect(engine.getStatus().connected).toBe(true);
      });

      it("ends disconnected when a connect event listener disconnects", () => {
        const store = createTestStore({ count: 0 });
        const engine = createSyncEngine({
          backend: createMemoryBackend(),
          adapter: store.adapter,
        });
        const violations = observe(engine, store);
        engine.subscribe((event) => {
          if (event === "connect") engine.disconnect();
        });

        engine.connect();

        expect(violations).toEqual([]);
        expect(engine.getStatus().connected).toBe(false);
      });
    });

    describe("from a sync event listener", () => {
      it("ends disconnected when a ready listener disconnects", async () => {
        const store = createTestStore({ count: 0 });
        const { engine, waits } = waitingEngine(createMemoryBackend(), store);
        const violations = observe(engine, store);
        engine.subscribe((event) => {
          if (event === "ready") engine.disconnect();
        });

        waits[0]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus().connected).toBe(false);
      });

      it("clears the failure when a disconnect listener retries a failed wait, sends no error, and onError still runs", async () => {
        const store = createTestStore({ count: 0 });
        const reported: unknown[] = [];
        const { engine, waits } = waitingEngine(createMemoryBackend(), store, {
          onError: (error) => reported.push(error),
        });
        const violations = observe(engine, store);
        let retries = 1;
        engine.subscribe((event) => {
          if (event === "disconnect" && retries-- > 0) engine.connect();
        });
        const seen = record(engine);
        const error = new Error("ready");

        waits[0]!.reject(error);
        await settled();

        expect(violations).toEqual([]);
        expect(reported).toEqual([error]);
        expect(seen.map(([event]) => event)).not.toContain("error");
        expect(engine.getStatus()).toEqual({
          connected: true,
          ready: false,
          failure: null,
        });
      });
    });

    describe("from an error listener", () => {
      it("retries a failed wait", async () => {
        const store = createTestStore({ count: 0 });
        const { engine, waits } = waitingEngine(createMemoryBackend(), store, {
          onError: () => {},
        });
        const violations = observe(engine, store);
        let retries = 1;
        engine.subscribe((event) => {
          if (event === "error" && retries-- > 0) engine.connect();
        });

        waits[0]!.reject(new Error("ready"));
        await settled();
        expect(engine.getStatus()).toEqual({
          connected: true,
          ready: false,
          failure: null,
        });

        waits[1]!.resolve();
        await settled();

        expect(violations).toEqual([]);
        expect(engine.getStatus().ready).toBe(true);
      });

      it("reconnects after a failed connect, which still throws", () => {
        const store = createTestStore({ count: 0 });
        const getState = store.adapter.getState;
        const error = new Error("getState");
        store.adapter.getState = () => {
          throw error;
        };
        const engine = createSyncEngine({
          backend: createMemoryBackend(),
          adapter: store.adapter,
        });
        const violations = observe(engine, store);
        engine.subscribe((event) => {
          store.adapter.getState = getState;
          if (event === "error") engine.connect();
        });

        expect(() => engine.connect()).toThrow(error);

        expect(violations).toEqual([]);
        expect(engine.getStatus()).toEqual({
          connected: true,
          ready: true,
          failure: null,
        });
      });

      it("returns to the same object when it repairs a failure at once", () => {
        const backend = createMemoryBackend();
        const store = createTestStore({ count: 0 });
        const engine = createSyncEngine({
          backend,
          adapter: store.adapter,
          onError: () => {},
        });
        engine.connect();
        const before = engine.getStatus();
        const write = backend.write;
        backend.write = () => {
          throw new Error("write");
        };
        const seen: string[] = [];
        engine.subscribe((event) => {
          seen.push(`${event}: ${engine.getStatus().failure !== null}`);
          if (event !== "error") return;
          backend.write = write;
          store.setState({ count: 2 });
        });

        store.setState({ count: 1 });

        expect(seen).toEqual(["error: true", "local: false"]);
        expect(engine.getStatus()).toBe(before);
      });
    });

    it("keeps a failure when a subscriber disconnects during the apply after it", () => {
      const backend = createMemoryBackend();
      const store = createTestStore({ count: 0 });
      const engine = createSyncEngine({
        backend,
        adapter: store.adapter,
        onError: () => {},
      });
      engine.connect();
      const write = backend.write;
      const error = new Error("write");
      backend.write = () => {
        throw error;
      };
      store.setState({ count: 1 });
      backend.write = write;
      onFirstStoreChange(store, () => engine.disconnect());

      backend.receive({ count: 2 });

      expect(engine.getStatus()).toEqual({
        connected: false,
        ready: false,
        failure: { error, source: "backend" },
      });
    });
  });
});
