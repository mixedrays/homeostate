// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Braces } from "lucide-react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createSyncEngine, type StoreAdapter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { DemoLayout } from "../components/DemoLayout";

beforeAll(() => {
  // @ts-expect-error React uses this global to enable act in a test environment.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A demo around an engine synced to a memory backend, with a provider that never connects. */
async function renderDemo() {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider("ws://localhost:1", "room", doc, {
    connect: false,
    disableBc: true,
  });
  let state = { count: 0 };
  const listeners = new Set<() => void>();
  const adapter: StoreAdapter<typeof state> = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const backend = createMemoryBackend();
  const engine = createSyncEngine(backend, adapter, { onError: () => {} });
  engine.connect();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    provider.destroy();
    doc.destroy();
    container.remove();
  });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoLayout
          demo={{
            name: "Demo",
            title: "Demo",
            description: "A demo",
            icon: Braces,
            accent: "indigo",
          }}
          provider={provider}
          devtools={{ name: "Demo", adapter, backend, engine }}
          back={{ to: "/", label: "Back" }}
          footer="Footer"
        >
          <p>Content</p>
        </DemoLayout>
      </MemoryRouter>,
    ),
  );
  const change = (count: number) => {
    state = { count };
    for (const listener of [...listeners]) listener();
  };
  const notice = () => container.querySelector("[role=alert]");
  return { backend, change, notice, container };
}

describe("DemoLayout", () => {
  it("shows no failure notice while the engine has none", async () => {
    const { notice } = await renderDemo();

    expect(notice()).toBeNull();
  });

  it("shows a failed write, and clears it once the next change syncs", async () => {
    const { backend, change, notice } = await renderDemo();
    const write = backend.write;
    backend.write = () => {
      throw new Error("The document is full");
    };

    await act(async () => change(1));
    expect(notice()?.textContent).toContain("The document is full");

    backend.write = write;
    await act(async () => change(2));
    expect(notice()).toBeNull();
  });

  it("keeps the provider's badge beside the notice", async () => {
    const { backend, change, container } = await renderDemo();
    backend.write = () => {
      throw new Error("The document is full");
    };

    await act(async () => change(1));

    expect(container.querySelector("header")?.textContent).toContain("Offline");
  });
});
