// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mountDevtools, type MountedDevtools } from "../mount";
import { createTestStore, tick } from "./helpers";

let devtools: MountedDevtools | undefined;

const host = () => document.querySelector("[data-homeostate-devtools]");
const labelled = (label: string) =>
  host()?.shadowRoot?.querySelector(`[aria-label="${label}"]`) ?? null;

const mount = (open?: boolean) => {
  const store = createTestStore({ count: 1 });
  devtools = mountDevtools({
    sources: [{ name: "Counter", adapter: store.adapter }],
    open,
  });
  return devtools;
};

// Load the panel once up front, so the tests wait for mounting rather than for its sources
// to be transformed.
beforeAll(async () => {
  await import("../render");
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  devtools?.unmount();
  devtools = undefined;
});

describe("mountDevtools", () => {
  it("puts the devtools on the page and takes them off again", async () => {
    const mounted = mount();
    await vi.waitFor(() => {
      expect(labelled("Open Homeostate devtools")).not.toBeNull();
    });

    mounted.unmount();

    expect(host()).toBeNull();
  });

  it("updates options, such as whether the panel is open", async () => {
    const mounted = mount(false);
    await vi.waitFor(() => {
      expect(host()).not.toBeNull();
    });
    expect(labelled("Store state")).toBeNull();

    mounted.update({ open: true });

    await vi.waitFor(() => {
      expect(labelled("Store state")?.textContent).toContain("count");
    });
  });

  it("stays off the page when unmounted before the panel loaded", async () => {
    mount().unmount();
    await tick();

    expect(host()).toBeNull();
  });
});
