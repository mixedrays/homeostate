// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SyncToggle } from "../components/SyncToggle";

/**
 * The offline button's label names its action, so `aria-pressed` would make a screen reader
 * announce "Go online, toggle button, pressed" while offline: the state twice, contradicting.
 */

beforeAll(() => {
  // @ts-expect-error React uses this global to enable act in a test environment.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("SyncToggle", () => {
  it.each([true, false])(
    "names the action without aria-pressed (online: %s)",
    async (online) => {
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () =>
        root.render(<SyncToggle online={online} onToggle={() => {}} />),
      );
      const button = container.querySelector("button")!;
      expect(button.textContent).toBe(online ? "Go offline" : "Go online");
      expect(button.getAttribute("aria-pressed")).toBeNull();
      await act(async () => root.unmount());
    },
  );

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () =>
      root.render(<SyncToggle online onToggle={onToggle} />),
    );
    await act(async () => container.querySelector("button")!.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
