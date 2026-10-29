import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncDemo } from "../components/home/sync-demo.tsx";

describe("SyncDemo", () => {
  it("prerenders the loop's first frame: two windows with the same tasks, connected", () => {
    const html = renderToStaticMarkup(<SyncDemo />);

    expect(html).toContain('data-window="a"');
    expect(html).toContain('data-window="b"');
    expect(html).toContain('data-state="connected"');
    for (const task of ["Write docs", "Fix login bug", "Ship v0.4"]) {
      expect(html.split(task)).toHaveLength(3);
    }
    expect(html).not.toContain("data-done=");
    expect(html).toContain("Tick a task in one store.");
  });
});
