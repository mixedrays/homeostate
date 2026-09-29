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
import { createSyncEngine, type SyncEngine } from "@homeostate/core";
import {
  createMemoryBackend,
  type MemoryBackend,
} from "@homeostate/core/testing";
import { HomeostateDevtools } from "../index";
import { createTestStore, tick } from "./helpers";

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
});
