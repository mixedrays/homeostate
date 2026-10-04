import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistableDoc } from "@homeostate/core";
import { createNetworkLink, type NetworkLink } from "../network";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A document of strings, merged in the order they arrive. */
const createDoc = (initial: string[] = []) => {
  const ops = [...initial];
  const listeners = new Set<(update: Uint8Array) => void>();
  const encode = (list: string[]) => encoder.encode(JSON.stringify(list));
  const doc: PersistableDoc & { ops: string[]; add: (op: string) => void } = {
    ops,
    encode: () => encode(ops),
    apply: (update) => {
      for (const op of JSON.parse(decoder.decode(update)) as string[])
        if (!ops.includes(op)) ops.push(op);
    },
    subscribe: (onUpdate) => {
      listeners.add(onUpdate);
      return () => {
        listeners.delete(onUpdate);
      };
    },
    add: (op) => {
      ops.push(op);
      listeners.forEach((listener) => listener(encode([op])));
    },
  };
  return doc;
};

let link: NetworkLink | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  link?.destroy();
  link = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createNetworkLink", () => {
  it("starts the two documents in step", () => {
    const doc = createDoc(["seed"]);
    const wire = createDoc(["room"]);
    link = createNetworkLink(doc, wire);

    expect(wire.ops).toEqual(["room", "seed"]);
    expect(doc.ops).toEqual(["seed", "room"]);
  });

  it("relays updates both ways at once without conditions", () => {
    const doc = createDoc();
    const wire = createDoc();
    link = createNetworkLink(doc, wire);

    doc.add("local");
    wire.add("remote");

    expect(wire.ops).toEqual(["local", "remote"]);
    expect(doc.ops).toEqual(["local", "remote"]);
  });

  it("delays updates by the latency and jitter, keeping their order", () => {
    const doc = createDoc();
    const wire = createDoc();
    link = createNetworkLink(doc, wire);
    link.setConditions({ latency: 100, jitter: 100 });
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.5);

    doc.add("a");
    doc.add("b");
    doc.add("c");
    expect(link.getSnapshot().outgoing).toBe(3);

    vi.advanceTimersByTime(189);
    expect(wire.ops).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(wire.ops).toEqual(["a", "b", "c"]);
    expect(link.getSnapshot().outgoing).toBe(0);
  });

  it("holds everything while offline and merges both sides on coming back", () => {
    const doc = createDoc();
    const wire = createDoc();
    link = createNetworkLink(doc, wire, { offline: true });

    doc.add("local");
    wire.add("remote");
    vi.runAllTimers();
    expect(wire.ops).toEqual(["remote"]);
    expect(link.getSnapshot().connected).toBe(false);

    link.setConditions({ offline: false });

    expect(wire.ops).toEqual(["remote", "local"]);
    expect(doc.ops).toEqual(["local", "remote"]);
    expect(link.getSnapshot().connected).toBe(true);
  });

  it("drops what is on its way when the link goes down", () => {
    const doc = createDoc();
    const wire = createDoc();
    link = createNetworkLink(doc, wire, { latency: 100 });
    vi.runAllTimers();

    doc.add("a");
    link.setConditions({ offline: true });
    expect(link.getSnapshot().outgoing).toBe(0);
    vi.advanceTimersByTime(200);
    expect(wire.ops).toEqual([]);

    link.setConditions({ offline: false });
    vi.advanceTimersByTime(100);
    expect(wire.ops).toEqual(["a"]);
  });

  it("drops the link now and then while flaky", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const doc = createDoc();
    const wire = createDoc();
    link = createNetworkLink(doc, wire);

    link.setConditions({ flaky: true });
    vi.advanceTimersByTime(2999);
    expect(link.getSnapshot().connected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(link.getSnapshot().connected).toBe(false);

    doc.add("while down");
    expect(wire.ops).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(link.getSnapshot().connected).toBe(true);
    expect(wire.ops).toEqual(["while down"]);

    vi.advanceTimersByTime(3000);
    expect(link.getSnapshot().connected).toBe(false);
    link.setConditions({ flaky: false });
    expect(link.getSnapshot().connected).toBe(true);
  });

  it("notifies on changes and keeps its snapshot between them", () => {
    link = createNetworkLink(createDoc(), createDoc());
    const listener = vi.fn();
    link.subscribe(listener);
    const before = link.getSnapshot();
    expect(link.getSnapshot()).toBe(before);

    link.setConditions({ latency: 500 });

    expect(listener).toHaveBeenCalled();
    expect(link.getSnapshot().conditions).toEqual({
      latency: 500,
      jitter: 0,
      offline: false,
      flaky: false,
    });
  });

  it("stops relaying once destroyed", () => {
    const doc = createDoc();
    const wire = createDoc();
    link = createNetworkLink(doc, wire);

    link.destroy();
    doc.add("after");

    expect(wire.ops).toEqual([]);
  });
});
