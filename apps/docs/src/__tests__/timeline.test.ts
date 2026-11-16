import { describe, expect, it, vi } from "vitest";
import { createTimeline, STOPPED } from "../lib/timeline.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("createTimeline", () => {
  it("resolves a sleep once the clock has advanced past it", async () => {
    const timeline = createTimeline();
    const woke = vi.fn();
    void timeline.sleep(100).then(woke);

    timeline.advance(60);
    await settle();
    expect(woke).not.toHaveBeenCalled();

    timeline.advance(40);
    await settle();
    expect(woke).toHaveBeenCalledOnce();
  });

  it("holds sleeps while paused", async () => {
    const timeline = createTimeline();
    const woke = vi.fn();
    void timeline.sleep(50).then(woke);

    timeline.setPaused("user", true);
    timeline.advance(500);
    await settle();
    expect(woke).not.toHaveBeenCalled();

    timeline.setPaused("user", false);
    timeline.advance(50);
    await settle();
    expect(woke).toHaveBeenCalledOnce();
  });

  it("stays paused until every reason is lifted", async () => {
    const timeline = createTimeline();
    const woke = vi.fn();
    void timeline.sleep(50).then(woke);

    timeline.setPaused("user", true);
    timeline.setPaused("hidden", true);
    timeline.setPaused("hidden", false);
    expect(timeline.paused).toBe(true);
    timeline.advance(500);
    await settle();
    expect(woke).not.toHaveBeenCalled();

    timeline.setPaused("user", false);
    expect(timeline.paused).toBe(false);
    timeline.advance(50);
    await settle();
    expect(woke).toHaveBeenCalledOnce();
  });

  it("rejects pending and later sleeps once stopped", async () => {
    const timeline = createTimeline();
    const pending = timeline.sleep(100);

    timeline.stop();

    await expect(pending).rejects.toBe(STOPPED);
    await expect(timeline.sleep(10)).rejects.toBe(STOPPED);
  });
});
