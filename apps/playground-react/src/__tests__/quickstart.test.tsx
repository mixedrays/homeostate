// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

// Keep the real provider and its sync events, but exchange document updates in memory.
// This makes the quickstart check independent of a running server and browser tab channels.
vi.mock("y-websocket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("y-websocket")>();
  return {
    ...actual,
    WebsocketProvider: class extends actual.WebsocketProvider {
      constructor(url: string, room: string, doc: Y.Doc) {
        super(url, room, doc, { connect: false, disableBc: true });
      }
    },
  };
});

beforeAll(() => {
  // @ts-expect-error React uses this global to enable act in a test environment.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function openTab() {
  vi.resetModules();
  const counter = await import("./fixtures/quickstart/counter");
  const { default: App } = await import("./fixtures/quickstart/App");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    counter.useCounter.homeostate.disconnect();
    counter.provider.destroy();
    counter.doc.destroy();
    container.remove();
  });
  await act(async () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
  return { ...counter, container, button: container.querySelector("button")! };
}

function exchange(a: Y.Doc, b: Y.Doc) {
  const aUpdate = Y.encodeStateAsUpdate(a);
  const bUpdate = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bUpdate);
  Y.applyUpdate(b, aUpdate);
}

describe("getting started", () => {
  it.each(["counter.ts", "App.tsx"])(
    "publishes the typechecked, executable %s fixture verbatim",
    (file) => {
      const guide = readFileSync(
        "apps/docs/content/getting-started.md",
        "utf8",
      );
      const fixture = readFileSync(
        `apps/playground-react/src/__tests__/fixtures/quickstart/${file}`,
        "utf8",
      );
      const language = file.endsWith("tsx") ? "tsx" : "ts";
      expect(guide).toContain(
        `\`\`\`${language} title="src/${file}"\n${fixture.trimEnd()}\n\`\`\``,
      );
    },
  );

  it("waits for sync, shares button clicks, and keeps the count when a tab joins", async () => {
    const first = await openTab();
    expect(first.button.disabled).toBe(true);
    expect(first.container.textContent).toContain(
      "Connecting to the sync server",
    );
    expect(first.doc.getMap("shared").toJSON()).toEqual({});

    await act(async () => {
      first.provider.synced = true;
    });
    expect(first.button.disabled).toBe(false);
    await act(async () => first.button.click());
    expect(first.container.textContent).toContain("Count: 1");

    const second = await openTab();
    await act(async () => {
      exchange(first.doc, second.doc);
      second.provider.synced = true;
    });
    expect(first.container.textContent).toContain("Count: 1");
    expect(second.container.textContent).toContain("Count: 1");

    await act(async () => {
      second.button.click();
      exchange(first.doc, second.doc);
    });
    for (const tab of [first, second]) {
      expect(tab.container.textContent).toContain("Count: 2");
      expect(tab.doc.getMap("shared").toJSON()).toEqual({ count: 2 });
      expect(typeof tab.useCounter.getState().increment).toBe("function");
    }

    const joining = await openTab();
    await act(async () => {
      exchange(first.doc, joining.doc);
      joining.provider.synced = true;
    });
    expect(joining.container.textContent).toContain("Count: 2");
    expect(first.useCounter.getState().count).toBe(2);

    await act(async () => {
      second.provider.synced = false;
    });
    expect(second.button.disabled).toBe(true);
  });
});
