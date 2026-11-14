// @vitest-environment jsdom
import { act, StrictMode, useLayoutEffect, useState } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createSyncEngine,
  type StoreAdapter,
  type SyncEngine,
  type SyncEvent,
  type SyncStatus,
} from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { useSyncStatus } from "../index";

beforeAll(() => {
  // @ts-expect-error React uses this global to enable act in a test environment.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

type State = { count: number };

/** A store to sync, with `set` as the local change. */
const createStore = () => {
  let state: State = { count: 0 };
  const listeners = new Set<() => void>();
  const adapter: StoreAdapter<State> = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const set = (count: number) => {
    state = { count };
    for (const listener of [...listeners]) listener();
  };
  return { adapter, set };
};

const createEngine = (backend: MemoryBackend = createMemoryBackend()) => {
  const store = createStore();
  return {
    backend,
    store,
    engine: createSyncEngine({ backend, adapter: store.adapter }),
  };
};

const describeStatus = ({ connected, failure }: SyncStatus): string =>
  (connected ? "connected" : "disconnected") +
  (failure === null ? "" : `, ${failure.source}`);

const roots: Root[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
});

/** Renders `element`, and returns its container. */
const render = async (element: React.ReactNode): Promise<HTMLElement> => {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return container;
};

/** Shows the status of `engine`, and counts its renders in `renders`. */
const Badge = ({
  engine,
  renders = { count: 0 },
}: {
  engine: SyncEngine;
  renders?: { count: number };
}) => {
  const status = useSyncStatus(engine);
  renders.count++;
  return <p>{describeStatus(status)}</p>;
};

describe("useSyncStatus", () => {
  it("re-renders as the engine connects and disconnects", async () => {
    const { engine } = createEngine();
    const container = await render(<Badge engine={engine} />);
    expect(container.textContent).toBe("disconnected");

    await act(async () => engine.connect());
    expect(container.textContent).toBe("connected");

    await act(async () => engine.disconnect());
    expect(container.textContent).toBe("disconnected");
  });

  it("does not re-render for local and remote changes", async () => {
    const { backend, store, engine } = createEngine();
    engine.connect();
    const renders = { count: 0 };
    await render(<Badge engine={engine} renders={renders} />);
    const before = renders.count;
    const events: string[] = [];
    engine.subscribe((event) => events.push(event));

    await act(async () => {
      for (let count = 1; count <= 100; count++) {
        store.set(count);
        backend.receive({ count: count + 1000 });
      }
    });

    expect(events).toHaveLength(200);
    expect(renders.count).toBe(before);
  });

  it("shows a failure a component mounted after it", async () => {
    const { backend, store, engine } = createEngine();
    engine.connect();
    backend.write = () => {
      throw new Error("write");
    };
    expect(() => store.set(1)).toThrow("write");

    const container = await render(<Badge engine={engine} />);

    expect(container.textContent).toBe("connected, backend");
  });

  it("shows a failure as it happens, and its recovery", async () => {
    const { backend, store, engine } = createEngine();
    engine.connect();
    const container = await render(<Badge engine={engine} />);
    const write = backend.write;
    backend.write = () => {
      throw new Error("write");
    };

    await act(async () => {
      expect(() => store.set(1)).toThrow("write");
    });
    expect(container.textContent).toBe("connected, backend");

    backend.write = write;
    await act(async () => store.set(2));
    expect(container.textContent).toBe("connected");
  });

  it("renders once for a reconnect that clears a failure, which changes two fields", async () => {
    const backend = createMemoryBackend();
    const store = createStore();
    const engine = createSyncEngine({
      backend,
      adapter: store.adapter,
      onError: () => {},
    });
    const renders = { count: 0 };
    const container = await render(<Badge engine={engine} renders={renders} />);
    await act(async () => engine.connect());
    const write = backend.write;
    backend.write = () => {
      throw new Error("write");
    };
    await act(async () => store.set(1));
    await act(async () => engine.disconnect());
    backend.write = write;
    expect(container.textContent).toBe("disconnected, backend");
    const before = renders.count;

    await act(async () => engine.connect());

    expect(container.textContent).toBe("connected");
    expect(renders.count).toBe(before + 1);
  });

  it("subscribes once in effect and cleans up in Strict Mode", async () => {
    const { engine } = createEngine();
    let subscribed = 0;
    const counted: SyncEngine = {
      ...engine,
      subscribe: (listener) => {
        subscribed++;
        const unsubscribe = engine.subscribe(listener);
        return () => {
          subscribed--;
          unsubscribe();
        };
      },
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <StrictMode>
          <Badge engine={counted} />
        </StrictMode>,
      ),
    );
    expect(subscribed).toBe(1);

    await act(async () => engine.connect());
    expect(container.textContent).toBe("connected");

    await act(async () => root.unmount());
    expect(subscribed).toBe(0);
  });

  it("keeps its subscription across renders", async () => {
    const { engine } = createEngine();
    let subscriptions = 0;
    const counted: SyncEngine = {
      ...engine,
      subscribe: (listener) => {
        subscriptions++;
        return engine.subscribe(listener);
      },
    };
    let rerender: (tick: number) => void = () => {};
    const Parent = () => {
      const [, setTick] = useState(0);
      rerender = setTick;
      return <Badge engine={counted} />;
    };
    await render(<Parent />);
    expect(subscriptions).toBe(1);

    await act(async () => rerender(1));
    await act(async () => rerender(2));

    expect(subscriptions).toBe(1);
  });

  it("follows a new engine, in the same render, and leaves the old one", async () => {
    const first = createEngine().engine;
    const second = createEngine().engine;
    second.connect();
    let show: (engine: SyncEngine) => void = () => {};
    const shown: string[] = [];
    const Switcher = () => {
      const [engine, setEngine] = useState<SyncEngine>(first);
      show = setEngine;
      const status = useSyncStatus(engine);
      shown.push(
        `${engine === first ? "first" : "second"}: ${describeStatus(status)}`,
      );
      return null;
    };
    await render(<Switcher />);

    await act(async () => show(second));
    expect(shown).toEqual(["first: disconnected", "second: connected"]);

    await act(async () => first.connect());
    expect(shown).toHaveLength(2);

    await act(async () => second.disconnect());
    expect(shown[2]).toBe("second: disconnected");
  });

  it("catches a change between render and subscribe", async () => {
    const { engine } = createEngine();
    const ConnectsFirst = () => {
      useLayoutEffect(() => engine.connect(), []);
      return null;
    };

    const container = await render(
      <>
        <ConnectsFirst />
        <Badge engine={engine} />
      </>,
    );

    expect(container.textContent).toBe("connected");
  });

  it("works with an engine whose methods need it as this", async () => {
    const { engine } = createEngine();
    class Wrapped {
      getStatus() {
        return this.inner.getStatus();
      }
      subscribe(listener: (event: SyncEvent) => void) {
        return this.inner.subscribe(listener);
      }
      constructor(private inner: SyncEngine) {}
    }

    const Shown = ({ source }: { source: Wrapped }) => (
      <p>{describeStatus(useSyncStatus(source))}</p>
    );
    const container = await render(<Shown source={new Wrapped(engine)} />);
    await act(async () => engine.connect());

    expect(container.textContent).toBe("connected");
  });

  describe("hydration", () => {
    it("hydrates what the server rendered, then shows the engine's status", async () => {
      const { engine } = createEngine();
      engine.connect();
      const container = document.createElement("div");
      container.innerHTML = renderToString(<Badge engine={engine} />);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const recoverable: unknown[] = [];
      const rendered: string[] = [];
      const Hydrated = () => {
        const status = useSyncStatus(engine);
        rendered.push(describeStatus(status));
        return <p>{describeStatus(status)}</p>;
      };

      let root!: Root;
      await act(async () => {
        root = hydrateRoot(container, <Hydrated />, {
          onRecoverableError: (error) => recoverable.push(error),
        });
      });

      expect(rendered).toEqual(["disconnected", "connected"]);
      expect(container.textContent).toBe("connected");
      expect(recoverable).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
      roots.push(root);
    });
  });
});
