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
  const element = [...shadow().querySelectorAll<T>("[aria-label]")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
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

  it("does not overwrite a remote change when an untouched inline editor blurs", async () => {
    await render();
    await click(byLabel("Edit filter"));
    const input = byLabel<HTMLInputElement>("Value of filter");
    await act(async () =>
      backend.receive({ ...store.get(), filter: "remote" }),
    );
    await act(tick);
    await act(async () => input.blur());

    expect(store.get().filter).toBe("remote");
    expect((backend.read() as State).filter).toBe("remote");
  });

  it("keeps an inline draft when the value changes and can load the latest value", async () => {
    await render();
    await click(byLabel("Edit filter"));
    const input = byLabel<HTMLInputElement>("Value of filter");
    await type(input, "draft");
    await act(async () =>
      backend.receive({ ...store.get(), filter: "remote" }),
    );
    await act(tick);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      input.blur();
    });

    expect(store.get().filter).toBe("remote");
    expect(input.value).toBe("draft");
    expect(shadow().textContent).toContain(
      "The value changed since you started editing.",
    );
    await click(buttonWithText("Load latest"));
    expect(input.value).toBe("remote");
    await type(input, "next");
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await act(tick);
    expect(store.get().filter).toBe("next");
  });

  it("filters the state tree and expands or collapses all of it", async () => {
    await render();
    const tree = () => byLabel("Store state").textContent;

    await type(byLabel<HTMLInputElement>("Filter the state"), "milk");
    expect(tree()).toContain("milk");
    expect(tree()).not.toContain("done");
    expect(tree()).not.toContain("filter");

    await click(byLabel("Clear the filter"));
    await click(byLabel("Expand all"));
    await click(byLabel("Collapse all"));
    expect(tree()).not.toContain("milk");
    expect(byLabel("Expand all")).toBeTruthy();
    await click(byLabel("Expand all"));
    expect(tree()).toContain("milk");
  });

  it("highlights the JSON view, also while it is being typed", async () => {
    await render();
    await click(buttonWithText("JSON"));
    const textarea = byLabel<HTMLTextAreaElement>("Store state as JSON");
    const code = () => shadow().querySelector('[data-slot="json-highlight"]');
    const tokens = (kind: string) =>
      [...(code()?.querySelectorAll(`[data-token="${kind}"]`) ?? [])].map(
        (token) => token.textContent,
      );
    expect(tokens("key")).toEqual(['"todos"', '"title"', '"done"', '"filter"']);
    expect(tokens("string")).toEqual(['"milk"', '"all"']);
    expect(tokens("boolean")).toEqual(["false"]);
    expect(code()?.textContent).toBe(`${textarea.value}\n`);

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(textarea, '{ "count": -1.5e3, "note": "unclosed\n}');
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(tokens("number")).toEqual(["-1.5e3"]);
    expect(tokens("string")).toEqual(['"unclosed']);
    expect(code()?.textContent).toBe(`${textarea.value}\n`);
  });

  describe("tree keyboard navigation", () => {
    const rows = () => [
      ...byLabel("Store state").querySelectorAll<HTMLElement>(
        '[role="treeitem"]',
      ),
    ];
    const focused = () => shadow().activeElement?.getAttribute("aria-label");
    const press = async (code: string, key = code) => {
      await act(async () => {
        shadow().activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { code, key, bubbles: true }),
        );
      });
      await act(tick);
    };

    it("is one tab stop, moved with the arrows, Home, End and typing", async () => {
      await render();
      expect(rows().filter((row) => row.tabIndex === 0)).toEqual([rows()[0]]);
      await act(async () => rows()[0].focus());
      expect(focused()).toBe("todos: Array(1), synced");

      await press("ArrowDown");
      expect(focused()).toBe("0: {…} 2 keys");
      await press("ArrowLeft");
      expect(rows()).toHaveLength(3);
      expect(shadow().activeElement?.getAttribute("aria-expanded")).toBe(
        "false",
      );
      await press("ArrowRight");
      await press("ArrowRight");
      expect(focused()).toBe('title: "milk"');
      await press("ArrowLeft");
      expect(focused()).toBe("0: {…} 2 keys");

      await press("End");
      expect(focused()).toBe('filter: "all", synced');
      await press("Home");
      expect(focused()).toBe("todos: Array(1), synced");
      await press("KeyF", "f");
      expect(focused()).toBe('filter: "all", synced');
      expect(rows().filter((row) => row.tabIndex === 0)).toEqual([
        shadow().activeElement,
      ]);
    });

    it("edits with Enter and returns focus to the row", async () => {
      await render();
      await act(async () => rows()[4].focus());
      await press("Enter");
      const input = byLabel<HTMLInputElement>("Value of filter");
      await type(input, "done");
      await act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      await act(tick);

      expect(store.get().filter).toBe("done");
      expect(focused()).toBe('filter: "done", synced');
    });

    it("deletes with Delete and keeps focus in the tree", async () => {
      await render();
      await act(async () => rows()[4].focus());
      await press("Delete");

      expect(store.get()).not.toHaveProperty("filter");
      expect(focused()).toBe("done: false");
    });
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

  it("browses a historical snapshot as a tree and JSON while the live state keeps changing", async () => {
    await render();
    await act(async () => store.set({ ...store.get(), filter: "active" }));
    await act(tick);
    await click(buttonWithText("Log"));
    await click(buttonWithText("#0"));
    await click(buttonWithText("Snapshot"));
    expect(byLabel("Snapshot #0").textContent).toContain('"all"');
    expect(byLabel("Snapshot #0").textContent).toContain("milk");
    expect(
      byLabel("Snapshot #0").querySelector('[aria-label^="Edit "]'),
    ).toBeNull();

    await click(buttonWithText("JSON"));
    const json = byLabel<HTMLTextAreaElement>("Snapshot #0 as JSON");
    expect(json.readOnly).toBe(true);
    expect(JSON.parse(json.value)).toEqual({
      todos: [{ title: "milk", done: false }],
      filter: "all",
    });

    await act(async () => store.set({ ...store.get(), filter: "done" }));
    await act(tick);
    expect(JSON.parse(json.value).filter).toBe("all");
    expect(store.get().filter).toBe("done");
    expect((backend.read() as State).filter).toBe("done");
  });

  it("compares a snapshot with the live state without restoring it, even while recording is paused", async () => {
    await render();
    await act(async () => store.set({ ...store.get(), filter: "active" }));
    await act(tick);
    await click(buttonWithText("Log"));
    await click(buttonWithText("#0"));
    await click(buttonWithText("Compare with current"));
    const comparison = () =>
      byLabel("Snapshot #0 compared with current state").textContent;
    expect(comparison()).toContain('"all"');
    expect(comparison()).toContain('"active"');
    expect(store.get().filter).toBe("active");
    expect((backend.read() as State).filter).toBe("active");

    await click(buttonWithText("Pause"));
    await act(async () => store.set({ ...store.get(), filter: "done" }));
    await act(tick);
    expect(comparison()).toContain('"done"');
    expect(comparison()).not.toContain('"active"');
    expect(
      byLabel("Changes, newest first").querySelectorAll(
        '[data-slot="collapsible-trigger"]',
      ),
    ).toHaveLength(2);

    await act(async () => store.set({ ...store.get(), filter: "all" }));
    await act(tick);
    expect(shadow().textContent).toContain(
      "This snapshot matches the current state.",
    );
    expect(buttonWithText("Current state").disabled).toBe(true);
  });

  it("distinguishes an entry's recorded diff from its comparison with current state", async () => {
    await render();
    await act(async () => store.set({ ...store.get(), filter: "active" }));
    await act(tick);
    await act(async () => store.set({ ...store.get(), filter: "done" }));
    await act(tick);
    await click(buttonWithText("Log"));
    await click(buttonWithText("#1"));
    const recorded = () => byLabel("Recorded diff for entry #1").textContent;
    expect(recorded()).toContain('"all"');
    expect(recorded()).toContain('"active"');
    expect(recorded()).not.toContain('"done"');

    await click(buttonWithText("Compare with current"));
    const comparison = byLabel(
      "Snapshot #1 compared with current state",
    ).textContent;
    expect(comparison).toContain('"active"');
    expect(comparison).toContain('"done"');
    expect(comparison).not.toContain('"all"');
    await click(buttonWithText("Diff"));
    expect(recorded()).toContain('"all"');
    expect(recorded()).not.toContain('"done"');
  });

  it("reports an unreadable live state instead of comparing a stale JSON view", async () => {
    const compared = createTestStore<Record<string, unknown>>({ count: 0 });
    await renderSources([{ name: "Counter", adapter: compared.adapter }]);
    await click(buttonWithText("Log"));
    await click(buttonWithText("#0"));
    await click(buttonWithText("Compare with current"));
    expect(shadow().textContent).toContain(
      "This snapshot matches the current state.",
    );
    const cyclic: Record<string, unknown> = { count: 1 };
    cyclic.self = cyclic;
    await act(async () => compared.set(cyclic));
    await act(tick);
    expect(shadow().querySelector('[role="alert"]')?.textContent).toContain(
      "Current state cannot be read as JSON",
    );
    expect(shadow().textContent).not.toContain(
      "This snapshot matches the current state.",
    );

    await act(async () => compared.set({ count: 1 }));
    await act(tick);
    expect(shadow().querySelector('[role="alert"]')).toBeNull();
    expect(
      byLabel("Snapshot #0 compared with current state").textContent,
    ).toContain("count");
  });

  it("inspects full historical and current values with explicit comparison headings", async () => {
    const before = "Historical message ".repeat(8);
    const after = "Current message ".repeat(8);
    const compared = createTestStore({ message: before });
    await renderSources([{ name: "Messages", adapter: compared.adapter }]);
    await act(async () => compared.set({ message: after }));
    await act(tick);
    await click(buttonWithText("Log"));
    await click(buttonWithText("#0"));
    await click(buttonWithText("Compare with current"));
    const table = byLabel("Snapshot #0 compared with current state");
    expect(
      [...table.querySelectorAll('th[scope="col"]')].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["Path", "snapshot #0", "current"]);
    await click(byLabel("Inspect snapshot #0 value at message"));
    await click(byLabel("Inspect current value at message"));
    expect(
      JSON.parse(
        byLabel("Full snapshot #0 value at message").textContent ?? "",
      ),
    ).toBe(before);
    expect(
      JSON.parse(byLabel("Full current value at message").textContent ?? ""),
    ).toBe(after);
    expect(compared.get().message).toBe(after);
  });

  it.each([
    { connected: true, impact: "syncs this change to peers" },
    { connected: false, impact: "changes only the local store" },
    { connected: null, impact: "may sync to peers" },
  ])(
    "names the source and restoration impact when connected is $connected",
    async ({ connected, impact }) => {
      if (connected === false) engine.disconnect();
      await renderSources([
        {
          name: "Review store",
          adapter: store.adapter,
          backend,
          engine: connected === null ? undefined : engine,
        },
      ]);
      await act(async () => store.set({ ...store.get(), filter: "active" }));
      await act(tick);
      await click(buttonWithText("Log"));
      await click(buttonWithText("#0"));
      const restore = buttonWithText("Restore this state");
      const descriptionId = restore.getAttribute("aria-describedby");
      expect(descriptionId).not.toBeNull();
      const description = shadow().getElementById(descriptionId!);
      expect(description?.textContent).toContain("Review store");
      expect(description?.textContent).toContain(impact);
    },
  );

  it("filters the log by path and by origin", async () => {
    await render();
    await act(async () => {
      store.set({ ...store.get(), filter: "active" });
    });
    await act(tick);
    await act(async () => {
      store.set({ ...store.get(), todos: [] });
    });
    await act(tick);
    await click(buttonWithText("Log"));
    const log = () => byLabel("Changes, newest first").textContent;

    await type(byLabel<HTMLInputElement>("Filter by path"), "todos");
    expect(log()).toContain("todos");
    expect(log()).not.toContain("filter");

    await click(byLabel("Clear the filter"));
    await click(buttonWithText("local"));
    expect(log()).toContain("Initial state");
    expect(log()).not.toContain("todos");
    expect(shadow().textContent).toContain("1 of 3 entries");
  });

  it("names the log's pause action without aria-pressed", async () => {
    await render();
    await click(buttonWithText("Log"));
    expect(buttonWithText("Pause").getAttribute("aria-pressed")).toBeNull();

    await click(buttonWithText("Pause"));
    expect(buttonWithText("Resume").getAttribute("aria-pressed")).toBeNull();
  });

  it("disconnects and reconnects the engine from the Network tab", async () => {
    await render();
    await click(buttonWithText("Network"));
    const markState = () =>
      byLabel("Sync engine connected")
        .closest("label")
        ?.querySelector(".hm-mark")
        ?.getAttribute("data-state");
    expect(markState()).toBe("connected");

    const toggle = byLabel("Sync engine connected");
    await click(toggle);
    expect(engine.isConnected()).toBe(false);
    expect(shadow().textContent).toContain("Disconnected");
    expect(markState()).toBe("disconnected");

    await click(byLabel("Sync engine connected"));
    expect(engine.isConnected()).toBe(true);
    expect(markState()).toBe("connected");
  });

  it("closes from the tabs row", async () => {
    await render();
    await click(byLabel("Close devtools"));
    expect(shadow().querySelector('[aria-label="Store state"]')).toBeNull();
    expect(byLabel("Open Homeostate devtools")).toBeTruthy();
  });

  it("docks the panel to another side from the settings", async () => {
    await render();
    const side = () =>
      shadow()
        .querySelector('[data-slot="sheet-content"]')
        ?.getAttribute("data-side");
    expect(side()).toBe("right");

    await click(byLabel("Settings"));
    await click(byLabel("Dock to the bottom"));
    expect(side()).toBe("bottom");

    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(side()).toBe("bottom");
  });

  it("moves the floating button to another corner from the settings", async () => {
    await render();
    await click(byLabel("Settings"));
    await click(byLabel("Button at the top left"));
    expect(byLabel("Close Homeostate devtools").className).toContain(
      "top-4 left-4",
    );
  });

  it("switches the theme from the settings over the theme prop", async () => {
    await act(async () => {
      root.render(
        <HomeostateDevtools
          initialIsOpen
          theme="light"
          sources={[{ name: "Todos", adapter: store.adapter }]}
        />,
      );
    });
    await act(tick);
    const dark = () =>
      shadow()
        .querySelector("[data-devtools-root]")
        ?.classList.contains("dark");
    expect(dark()).toBe(false);

    await click(byLabel("Settings"));
    await click(byLabel("Dark theme"));
    expect(dark()).toBe(true);
  });

  it("shows the source in the status bar", async () => {
    await render();
    expect(shadow().querySelector("footer")?.textContent).toContain("Todos");
  });

  it("summarizes simultaneous sync issues and opens their details without changing state", async () => {
    engine.disconnect();
    store.set({ ...store.get(), filter: "done" });
    const network = createNetworkLink(createTestDoc(), createTestDoc(), {
      offline: true,
    });
    try {
      await renderSources([
        { name: "Todos", adapter: store.adapter, backend, engine, network },
      ]);
      const summary = byLabel("Sync status");
      expect(summary.textContent).toContain("3 issues");
      expect(summary.getAttribute("aria-expanded")).toBe("false");
      await click(summary);
      expect(summary.getAttribute("aria-expanded")).toBe("true");
      const details = byLabel("Sync status details");
      expect(details.textContent).toContain("Todos");
      expect(details.textContent).toContain("1 diverged");
      expect(details.textContent).toContain("Offline");
      expect(details.textContent).toContain("Disconnected");
      expect(store.get().filter).toBe("done");
      expect(engine.isConnected()).toBe(false);
      expect(network.getSnapshot().conditions.offline).toBe(true);

      await click(buttonWithText("1 diverged"));
      expect(
        byLabel("filter in the store and the backend").textContent,
      ).toContain('"done"');
      expect(
        shadow().querySelector('[aria-label="Sync status details"]'),
      ).toBeNull();
    } finally {
      await act(async () => network.destroy());
    }
  });

  it("switches between long source names and closes the previous source's status details", async () => {
    const name = "A source with a long descriptive name ".repeat(5);
    const otherName = "Another source with a long descriptive name ".repeat(5);
    const other = createTestStore({ count: 3 });
    await renderSources([
      { name, adapter: store.adapter, backend, engine },
      { name: otherName, adapter: other.adapter },
    ]);
    expect(byLabel("Source").getAttribute("title")).toBe(name);
    await click(byLabel("Sync status"));
    await click(byLabel("Source"));
    const option = [...shadow().querySelectorAll('[role="option"]')].find(
      (candidate) => candidate.textContent?.trim() === otherName.trim(),
    );
    expect(option).toBeTruthy();
    await click(option!);

    expect(byLabel("Source").getAttribute("title")).toBe(otherName);
    expect(byLabel("Store state").textContent).toContain("count");
    expect(byLabel("Store state").textContent).toContain("3");
    expect(
      shadow().querySelector('[aria-label="Sync status details"]'),
    ).toBeNull();
    expect(shadow().querySelector('[aria-label="Sync status"]')).toBeNull();
  });

  it("updates open status details as network conditions change and links to Network", async () => {
    const network = createNetworkLink(createTestDoc(), createTestDoc(), {
      offline: true,
    });
    try {
      await renderSources([{ name: "Todos", adapter: store.adapter, network }]);
      await click(byLabel("Sync status"));
      expect(byLabel("Sync status details").textContent).toContain("Offline");
      await act(async () =>
        network.setConditions({ offline: false, latency: 500 }),
      );
      expect(byLabel("Sync status details").textContent).toContain(
        "Conditions on",
      );
      expect(byLabel("Sync status").textContent).toContain("1 issue");
      await act(async () => network.setConditions({ latency: 0 }));
      expect(byLabel("Sync status details").textContent).toContain("Online");
      expect(byLabel("Sync status").textContent).toContain("Online");

      const online = [
        ...byLabel("Sync status details").querySelectorAll("button"),
      ].find((button) => button.textContent?.trim() === "Online");
      await click(online!);
      expect(byLabel("Offline")).toBeTruthy();
      expect(
        shadow().querySelector('[aria-label="Sync status details"]'),
      ).toBeNull();
    } finally {
      await act(async () => network.destroy());
    }
  });

  it("shows a disconnected engine in the status bar and on the button", async () => {
    await render();
    const status = () => shadow().querySelector("footer")?.textContent;
    const button = () => byLabel("Close Homeostate devtools");
    expect(status()).toContain("Connected");
    expect(button().getAttribute("title")).toBeNull();

    await click(buttonWithText("Network"));
    await click(byLabel("Sync engine connected"));
    await click(buttonWithText("State"));
    expect(status()).toContain("1 issue");
    expect(byLabel("Sync status").getAttribute("title")).toContain(
      "Disconnected",
    );
    expect(button().getAttribute("title")).toBe("Todos: disconnected");

    await click(byLabel("Sync status"));
    await click(buttonWithText("Disconnected"));
    expect(byLabel("Sync engine connected")).toBeTruthy();
  });

  it("compares a diverged key in the store and the backend", async () => {
    await render();
    await click(buttonWithText("Network"));
    await click(byLabel("Sync engine connected"));
    await act(async () => {
      store.set({ ...store.get(), filter: "done" });
    });
    await act(tick);

    await click(byLabel("Sync status"));
    await click(buttonWithText("1 diverged"));
    const values = byLabel("filter in the store and the backend").textContent;
    expect(values).toContain('"done"');
    expect(values).toContain('"all"');
  });

  it("expands and collapses differences beyond the first ten", async () => {
    const values = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`key${index}`, index]),
    );
    const compared = createTestStore({ values });
    const document = createMemoryBackend({
      values: Object.fromEntries(Object.keys(values).map((key) => [key, -1])),
    });
    await renderSources([
      { name: "Values", adapter: compared.adapter, backend: document },
    ]);
    await click(buttonWithText("Sync"));
    const table = byLabel("values in the store and the backend");
    const paths = () =>
      [...table.querySelectorAll('tbody th[scope="row"]')].map(
        (cell) => cell.textContent,
      );
    expect(paths()).toHaveLength(10);
    expect(paths()).not.toContain("values.key11");

    const expand = buttonWithText("Show all 12 differences");
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    await click(expand);
    expect(paths()).toHaveLength(12);
    expect(paths()).toContain("values.key11");
    expect(
      buttonWithText("Show first 10 differences").getAttribute("aria-expanded"),
    ).toBe("true");

    await click(buttonWithText("Show first 10 differences"));
    expect(paths()).toHaveLength(10);
  });

  it("inspects and copies full values and paths from both sides of a difference", async () => {
    const prefix = "A long shared prefix ".repeat(8);
    const current = `${prefix}\nstore ending`;
    const previous = `${prefix}\nbackend ending`;
    const compared = createTestStore({ payload: { message: current } });
    const document = createMemoryBackend({ payload: { message: previous } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      await renderSources([
        { name: "Values", adapter: compared.adapter, backend: document },
      ]);
      await click(buttonWithText("Sync"));
      const table = byLabel("payload in the store and the backend");
      expect(table.textContent).not.toContain("store ending");
      expect(table.textContent).not.toContain("backend ending");

      const inspect = byLabel("Inspect store value at payload.message");
      expect(inspect.getAttribute("aria-expanded")).toBe("false");
      await click(inspect);
      expect(inspect.getAttribute("aria-expanded")).toBe("true");
      expect(byLabel("Full store value at payload.message").textContent).toBe(
        JSON.stringify(current, null, 2),
      );
      await click(byLabel("Inspect backend value at payload.message"));
      expect(byLabel("Full backend value at payload.message").textContent).toBe(
        JSON.stringify(previous, null, 2),
      );

      await click(byLabel("Copy path payload.message"));
      expect(writeText).toHaveBeenLastCalledWith("payload.message");
      await click(byLabel("Copy store value at payload.message"));
      expect(writeText).toHaveBeenLastCalledWith(
        JSON.stringify(current, null, 2),
      );
      await click(byLabel("Copy backend value at payload.message"));
      expect(writeText).toHaveBeenLastCalledWith(
        JSON.stringify(previous, null, 2),
      );

      await click(inspect);
      expect(
        shadow().querySelector(
          '[aria-label="Full store value at payload.message"]',
        ),
      ).toBeNull();
      expect(compared.get().payload.message).toBe(current);
      expect(document.read()).toEqual({ payload: { message: previous } });
    } finally {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it.each([
    { value: { nested: { title: "Full nested value" }, empty: [] } },
    { value: [null, false, 3, { title: "Full array item" }] },
  ])("inspects a full container value: $value", async ({ value }) => {
    const compared = createTestStore({ payload: { value } });
    const document = createMemoryBackend({ payload: { value: null } });
    await renderSources([
      { name: "Values", adapter: compared.adapter, backend: document },
    ]);
    await click(buttonWithText("Sync"));
    const inspect = byLabel("Inspect store value at payload.value");
    await click(inspect);
    const full = byLabel("Full store value at payload.value");
    expect(inspect.getAttribute("aria-controls")).toBe(full.id);
    expect(JSON.parse(full.textContent ?? "")).toEqual(value);
  });

  it("copies null and unusual paths while leaving missing values without a copy action", async () => {
    const compared = createTestStore({
      payload: { added: null, "odd.key": false },
    });
    const document = createMemoryBackend({
      payload: { removed: null, "odd.key": true },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      await renderSources([
        { name: "Values", adapter: compared.adapter, backend: document },
      ]);
      await click(buttonWithText("Sync"));
      expect(
        byLabel("payload in the store and the backend").textContent,
      ).toContain("not set");
      expect(
        shadow().querySelector(
          '[aria-label="Copy backend value at payload.added"]',
        ),
      ).toBeNull();
      expect(
        shadow().querySelector(
          '[aria-label="Copy store value at payload.removed"]',
        ),
      ).toBeNull();
      await click(byLabel("Copy store value at payload.added"));
      expect(writeText).toHaveBeenLastCalledWith("null");
      await click(byLabel("Copy backend value at payload.removed"));
      expect(writeText).toHaveBeenLastCalledWith("null");
      await click(byLabel('Copy path payload["odd.key"]'));
      expect(writeText).toHaveBeenLastCalledWith('payload["odd.key"]');
      await click(byLabel('Copy store value at payload["odd.key"]'));
      expect(writeText).toHaveBeenLastCalledWith("false");
    } finally {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("keeps an inspected path open when another difference appears before it", async () => {
    const message = "Full store message ".repeat(8);
    const compared = createTestStore({ payload: { earlier: 0, message } });
    const document = createMemoryBackend({
      payload: { earlier: 0, message: "old" },
    });
    await renderSources([
      { name: "Values", adapter: compared.adapter, backend: document },
    ]);
    await click(buttonWithText("Sync"));
    await click(byLabel("Inspect store value at payload.message"));

    await act(async () => compared.set({ payload: { earlier: 1, message } }));
    await act(tick);
    expect(byLabel("Full store value at payload.message").textContent).toBe(
      JSON.stringify(message, null, 2),
    );
    expect(
      byLabel("Inspect store value at payload.message").getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
  });

  it("shows the key status against the backend", async () => {
    await render();
    await click(buttonWithText("Sync"));
    expect(byLabel("Backend document").textContent).toContain("milk");
    expect(shadow().textContent).toContain("2 synced");
  });

  it("shows a backend read failure instead of an empty document and recovers", async () => {
    let fail = true;
    await renderSources([
      {
        name: "Todos",
        adapter: store.adapter,
        backend: {
          ...backend,
          read: () => {
            if (fail) throw new Error("backend unavailable");
            return backend.read();
          },
        },
      },
    ]);
    expect(
      byLabel("Close Homeostate devtools").getAttribute("title"),
    ).toContain("backend read failed");
    await click(byLabel("Sync status"));
    await click(buttonWithText("Backend error"));
    expect(shadow().querySelector('[role="alert"]')?.textContent).toContain(
      "backend unavailable",
    );
    expect(shadow().textContent).not.toContain("No backend");
    expect(
      shadow().querySelector('[aria-label="Backend document"]'),
    ).toBeNull();

    fail = false;
    await act(async () => backend.receive(store.get()));
    await act(tick);
    expect(shadow().querySelector('[role="alert"]')).toBeNull();
    expect(shadow().textContent).toContain("2 synced");
    expect(byLabel("Backend document").textContent).toContain("milk");
    expect(
      byLabel("Close Homeostate devtools").getAttribute("title"),
    ).toBeNull();
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
    await click(buttonWithText("Snapshot"));
    expect(byLabel("Snapshot #4").textContent).toContain('"imported"');
    expect(store.get().filter).toBe("all");
    await click(buttonWithText("Compare with current"));
    const comparison = byLabel(
      "Snapshot #4 compared with current state",
    ).textContent;
    expect(comparison).toContain('"imported"');
    expect(comparison).toContain('"all"');
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

  it("rejects an invalid log timestamp and keeps the recorded log", async () => {
    await render();
    await click(buttonWithText("Log"));
    const text = serializeLog("Todos", [
      {
        id: 4,
        at: 1e20,
        origin: "local",
        state: { filter: "invalid" },
        diff: [],
      },
    ]);
    const input = byLabel<HTMLInputElement>("Log file to import");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([text], "log.json", { type: "application/json" })],
    });
    await act(async () =>
      input.dispatchEvent(new Event("change", { bubbles: true })),
    );
    await act(tick);

    expect(shadow().querySelector('[role="alert"]')?.textContent).toBe(
      "Import failed: Entry 1 has no valid time.",
    );
    expect(byLabel("Changes, newest first").textContent).toContain(
      "Initial state",
    );
    expect(store.get().filter).toBe("all");
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

  it("keeps a failed storage operation visible after stats refresh and removes it on retry", async () => {
    const persistence = createPersistence(
      createTestDoc(),
      createMemoryPersistenceAdapter(),
      { key: "todos" },
    );
    await persistence.whenLoaded;
    let fail = true;
    await renderSources([
      {
        name: "Todos",
        adapter: store.adapter,
        persistence: {
          ...persistence,
          compact: async () => {
            if (fail) throw new Error("compact failed");
            await persistence.compact();
          },
        },
      },
    ]);
    try {
      await click(buttonWithText("Storage"));
      await click(buttonWithText("Compact"));
      expect(shadow().querySelector('[role="alert"]')?.textContent).toContain(
        "compact failed",
      );
      await act(async () => store.set({ ...store.get(), filter: "active" }));
      await act(tick);
      expect(shadow().querySelector('[role="alert"]')?.textContent).toContain(
        "compact failed",
      );
      fail = false;
      await click(buttonWithText("Compact"));
      expect(shadow().querySelector('[role="alert"]')).toBeNull();
    } finally {
      await persistence.destroy();
    }
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
