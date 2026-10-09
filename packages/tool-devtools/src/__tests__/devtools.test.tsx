// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createPersistence,
  createSyncEngine,
  type SyncEngine,
} from "@homeostate/core";
import {
  createMemoryBackend,
  createMemoryPersistenceAdapter,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { HomeostateDevtools, type DevtoolsSource } from "../index";
import { serializeLog } from "../log-file";
import { createNetworkLink } from "../network";
import { createTestDoc, createTestStore, tick } from "./helpers";

interface State {
  todos: { title: string; done: boolean }[];
  filter: string;
}

let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof createTestStore<State>>;
let backend: MemoryBackend;
let engine: SyncEngine;

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.localStorage.clear();
  store = createTestStore<State>({
    todos: [{ title: "milk", done: false }],
    filter: "all",
  });
  backend = createMemoryBackend();
  engine = createSyncEngine(backend, store.adapter);
  engine.connect();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  engine.disconnect();
});

const render = async (initialIsOpen = true) => {
  await act(async () => {
    root.render(
      <HomeostateDevtools
        initialIsOpen={initialIsOpen}
        sources={[{ name: "Todos", adapter: store.adapter, backend, engine }]}
      />,
    );
  });
  await act(tick);
};

const renderSources = async (sources: DevtoolsSource[]) => {
  await act(async () => {
    root.render(<HomeostateDevtools initialIsOpen sources={sources} />);
  });
  await act(tick);
};

const shadow = (): ShadowRoot => {
  const host = document.querySelector("[data-homeostate-devtools]");
  if (!host?.shadowRoot) throw new Error("devtools host not mounted");
  return host.shadowRoot;
};

const byLabel = <T extends Element = HTMLElement>(label: string): T => {
  const element = shadow().querySelector<T & Element>(
    `[aria-label="${label}"]`,
  );
  if (!element) throw new Error(`no element labelled ${label}`);
  return element;
};

const buttonWithText = (text: string): HTMLButtonElement => {
  const button = [...shadow().querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.trim().startsWith(text),
  );
  if (!button) throw new Error(`no button with text ${text}`);
  return button;
};

const click = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).click();
  });
  await act(tick);
};

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("HomeostateDevtools", () => {
  it("mounts in a shadow root on the body with its own styles", async () => {
    await render(false);
    const host = document.querySelector("[data-homeostate-devtools]");
    expect(host?.parentElement).toBe(document.body);
    expect(shadow().querySelector("style")).not.toBeNull();
    expect(byLabel("Open Homeostate devtools")).toBeTruthy();
  });

  it("opens from the floating button", async () => {
    await render(false);
    await click(byLabel("Open Homeostate devtools"));
    expect(shadow().textContent).toContain("Homeostate");
    expect(byLabel("Store state").textContent).toContain("milk");
  });

  it("edits a value in the tree through the adapter", async () => {
    await render();
    await click(byLabel("Edit filter"));
    const input = byLabel<HTMLInputElement>("Value of filter");
    await type(input, "done");
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await act(tick);

    expect(store.get().filter).toBe("done");
    expect((backend.read() as State).filter).toBe("done");
  });

  it("keeps keys typed into a field from reaching page shortcuts", async () => {
    await render();
    await click(byLabel("Edit filter"));
    const input = byLabel<HTMLInputElement>("Value of filter");
    const pageKeys: string[] = [];
    const onKeyDown = (event: KeyboardEvent) => pageKeys.push(event.key);
    window.addEventListener("keydown", onKeyDown);
    try {
      for (const key of ["Backspace", "a", "Tab"]) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, composed: true }),
        );
      }
    } finally {
      window.removeEventListener("keydown", onKeyDown);
    }

    expect(pageKeys).toEqual(["Tab"]);
  });

  it("toggles a boolean with one click", async () => {
    await render();
    await click(byLabel("Toggle todos[0].done"));
    expect(store.get().todos[0].done).toBe(true);
  });

  it("deletes an array item", async () => {
    await render();
    await click(byLabel("Delete todos[0]"));
    expect(store.get().todos).toEqual([]);
  });

  it("shows changes from the store as they happen", async () => {
    await render();
    await act(async () => {
      store.set({ ...store.get(), filter: "active" });
    });
    await act(tick);
    expect(byLabel("Store state").textContent).toContain('"active"');
  });

  it("logs changes and restores an earlier state", async () => {
    await render();
    await act(async () => {
      store.set({ ...store.get(), filter: "active" });
    });
    await act(tick);

    await click(buttonWithText("Log"));
    const log = byLabel("Changes, newest first");
    expect(log.textContent).toContain("filter");
    expect(log.textContent).toContain("Initial state");

    await click(buttonWithText("#0"));
    await click(buttonWithText("Restore this state"));
    expect(store.get().filter).toBe("all");
  });

  it("names the log's pause action without aria-pressed", async () => {
    await render();
    await click(buttonWithText("Log"));
    expect(buttonWithText("Pause").getAttribute("aria-pressed")).toBeNull();

    await click(buttonWithText("Pause"));
    expect(buttonWithText("Resume").getAttribute("aria-pressed")).toBeNull();
  });

  it("disconnects and reconnects the engine", async () => {
    await render();
    const toggle = byLabel("Sync engine connected");
    await click(toggle);
    expect(engine.isConnected()).toBe(false);
    expect(shadow().textContent).toContain("Disconnected");

    await click(byLabel("Sync engine connected"));
    expect(engine.isConnected()).toBe(true);
  });

  it("shows the key status against the backend", async () => {
    await render();
    await click(buttonWithText("Sync"));
    expect(byLabel("Backend document").textContent).toContain("milk");
    expect(shadow().textContent).toContain("2 synced");
  });

  it("follows a controlled open prop and reports changes", async () => {
    const onOpenChange = vi.fn();
    const renderOpen = (open: boolean) =>
      act(async () => {
        root.render(
          <HomeostateDevtools
            open={open}
            onOpenChange={onOpenChange}
            sources={[{ name: "Todos", adapter: store.adapter }]}
          />,
        );
      });

    await renderOpen(false);
    await act(tick);
    await click(byLabel("Open Homeostate devtools"));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(shadow().querySelector('[aria-label="Store state"]')).toBeNull();

    await renderOpen(true);
    await act(tick);
    expect(byLabel("Store state").textContent).toContain("milk");
  });

  it("warns about values in synced keys that are not JSON", async () => {
    const dated = createTestStore({ title: "a", due: new Date(0) });
    await renderSources([{ name: "Dated", adapter: dated.adapter }]);

    expect(shadow().textContent).toContain("1 value is not JSON");
    expect(byLabel("Store state").textContent).toContain("Date");
    expect(byLabel("1 not JSON")).toBeTruthy();
  });

  it("exports the log as a JSON file", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:log";
    });
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    try {
      await render();
      await act(async () => {
        store.set({ ...store.get(), filter: "active" });
      });
      await act(tick);
      await click(buttonWithText("Log"));
      await click(buttonWithText("Export"));
    } finally {
      anchorClick.mockRestore();
    }

    expect(downloads).toEqual([
      expect.stringMatching(/^homeostate-log-todos-.+\.json$/),
    ]);
    const file = JSON.parse(await blobs[0].text()) as {
      source: string;
      entries: { origin: string }[];
    };
    expect(file.source).toBe("Todos");
    expect(file.entries.map(({ origin }) => origin)).toEqual([
      "initial",
      "local",
    ]);
  });

  it("imports an exported log and restores its states", async () => {
    await render();
    await click(buttonWithText("Log"));
    const text = serializeLog("Todos", [
      {
        id: 4,
        at: 0,
        origin: "local",
        state: { todos: [], filter: "imported" },
        diff: [],
      },
    ]);
    const input = byLabel<HTMLInputElement>("Log file to import");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([text], "log.json", { type: "application/json" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(tick);

    const log = byLabel("Changes, newest first");
    expect(log.textContent).toContain("imported");
    expect(log.textContent).not.toContain("Initial state");

    await click(buttonWithText("#4"));
    await click(buttonWithText("Restore this state"));
    expect(store.get()).toEqual({ todos: [], filter: "imported" });
  });

  it("reports a file it cannot import", async () => {
    await render();
    await click(buttonWithText("Log"));
    const input = byLabel<HTMLInputElement>("Log file to import");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["{}"], "log.json")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(tick);

    expect(shadow().querySelector('[role="alert"]')?.textContent).toBe(
      "Import failed: The file is not a Homeostate devtools log.",
    );
  });

  it("shows what is stored and compacts it", async () => {
    const doc = createTestDoc();
    const storage = createMemoryPersistenceAdapter();
    const persistence = createPersistence(doc, storage, { key: "todos" });
    await persistence.whenLoaded;
    doc.add("a");
    doc.add("b");
    await persistence.flush();

    await renderSources([
      { name: "Todos", adapter: store.adapter, persistence },
    ]);
    await click(buttonWithText("Storage"));
    await act(tick);
    expect(shadow().textContent).toMatch(/Updates\s*3/);

    await click(buttonWithText("Compact"));
    await act(tick);
    expect(storage.size("todos")).toBe(1);
    expect(shadow().textContent).toMatch(/Updates\s*1/);
  });

  it("explains the Storage tab without persistence", async () => {
    await render();
    await click(buttonWithText("Storage"));
    expect(shadow().textContent).toContain("No persistence");
  });

  it("changes network conditions from the Network tab", async () => {
    const network = createNetworkLink(createTestDoc(), createTestDoc());
    await renderSources([{ name: "Todos", adapter: store.adapter, network }]);
    await click(buttonWithText("Network"));

    await click(byLabel("Offline"));
    expect(network.getSnapshot().conditions.offline).toBe(true);
    expect(shadow().textContent).toContain("Network offline");

    await click(byLabel("Latency 500 ms"));
    expect(network.getSnapshot().conditions.latency).toBe(500);
    expect(byLabel("conditions on")).toBeTruthy();
    network.destroy();
  });

  it("explains the Network tab without a link", async () => {
    await render();
    await click(buttonWithText("Network"));
    expect(shadow().textContent).toContain("No network link");
  });
});
