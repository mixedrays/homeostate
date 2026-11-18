import * as A from "@automerge/automerge";
import { describe, expect, it, vi } from "vitest";
import { createAutomergeHandle } from "../index.js";

type Root = {
  count?: number;
  label?: string;
};

describe("createAutomergeHandle", () => {
  it("starts from an empty document", () => {
    const handle = createAutomergeHandle();
    expect(handle.doc()).toEqual({});
    expect(A.getHeads(handle.doc())).toEqual([]);
  });

  it("wraps the given document", () => {
    const doc = A.from<Root>({ count: 1 });
    expect(createAutomergeHandle(doc).doc()).toBe(doc);
  });

  it("applies a change and reports it as local", () => {
    const handle = createAutomergeHandle<Root>();
    const listener = vi.fn();
    handle.subscribe(listener);

    handle.change((doc) => {
      doc.count = 1;
    });

    expect(handle.doc()).toEqual({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ doc: handle.doc(), local: true });
  });

  it("applies an update and reports it as remote", () => {
    const handle = createAutomergeHandle<Root>(A.from<Root>({ count: 1 }));
    const other = A.change(A.load<Root>(A.save(handle.doc())), (doc) => {
      doc.label = "x";
    });
    const listener = vi.fn();
    handle.subscribe(listener);

    handle.update((doc) => A.merge(doc, other));

    expect(handle.doc()).toEqual({ count: 1, label: "x" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ doc: handle.doc(), local: false });
  });

  it("stays silent for a change without operations", () => {
    const handle = createAutomergeHandle<Root>();
    const listener = vi.fn();
    handle.subscribe(listener);
    const before = handle.doc();

    handle.change(() => {});

    expect(handle.doc()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("adopts an update that adds nothing new without notifying", () => {
    const handle = createAutomergeHandle<Root>();
    handle.change((doc) => {
      doc.count = 1;
    });
    const known = A.getLastLocalChange(handle.doc()) as Uint8Array;
    const listener = vi.fn();
    handle.subscribe(listener);

    handle.update((doc) => A.applyChanges(doc, [known])[0]);
    expect(listener).not.toHaveBeenCalled();

    handle.change((doc) => {
      doc.count = 2;
    });
    expect(handle.doc()).toEqual({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the document when an update throws", () => {
    const handle = createAutomergeHandle<Root>(A.from<Root>({ count: 1 }));
    const before = handle.doc();

    expect(() =>
      handle.update(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(handle.doc()).toBe(before);
    handle.change((doc) => {
      doc.count = 2;
    });
    expect(handle.doc()).toEqual({ count: 2 });
  });

  it("keeps a change a listener makes during an update and reports it to every listener", () => {
    const handle = createAutomergeHandle<Root>(A.from<Root>({ count: 1 }));
    const other = A.change(A.load<Root>(A.save(handle.doc())), (doc) => {
      doc.label = "x";
    });
    handle.subscribe(({ local }) => {
      if (!local)
        handle.change((doc) => {
          doc.count = 2;
        });
    });
    const events: boolean[] = [];
    handle.subscribe(({ local }) => events.push(local));

    handle.update((doc) => A.merge(doc, other));

    expect(handle.doc()).toEqual({ count: 2, label: "x" });
    // The listener's change reaches the next listener before the update does.
    expect(events).toEqual([true, false]);
  });

  it("notifies every listener of a change when one throws, then throws its error", () => {
    const handle = createAutomergeHandle<Root>();
    const second = vi.fn();
    handle.subscribe(() => {
      throw new Error("first");
    });
    handle.subscribe(second);

    expect(() =>
      handle.change((doc) => {
        doc.count = 1;
      }),
    ).toThrow("first");

    expect(handle.doc()).toEqual({ count: 1 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ doc: handle.doc(), local: true });
  });

  it("notifies every listener of an update when one throws, then throws its error", () => {
    const handle = createAutomergeHandle<Root>(A.from<Root>({ count: 1 }));
    const other = A.change(A.load<Root>(A.save(handle.doc())), (doc) => {
      doc.label = "x";
    });
    const second = vi.fn();
    handle.subscribe(() => {
      throw new Error("first");
    });
    handle.subscribe(second);

    expect(() => handle.update((doc) => A.merge(doc, other))).toThrow("first");

    expect(handle.doc()).toEqual({ count: 1, label: "x" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ doc: handle.doc(), local: false });
  });

  it("runs every listener when several throw, and throws the first error", () => {
    const handle = createAutomergeHandle<Root>();
    const calls: string[] = [];
    handle.subscribe(() => {
      calls.push("first");
      throw new Error("first");
    });
    handle.subscribe(() => {
      calls.push("second");
      throw new Error("second");
    });
    handle.subscribe(() => calls.push("third"));

    expect(() =>
      handle.change((doc) => {
        doc.count = 1;
      }),
    ).toThrow("first");

    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("throws a listener's error even when it is undefined", () => {
    const handle = createAutomergeHandle<Root>();
    const second = vi.fn();
    handle.subscribe(() => {
      throw undefined;
    });
    handle.subscribe(second);

    let thrown = false;
    try {
      handle.change((doc) => {
        doc.count = 1;
      });
    } catch (error) {
      thrown = true;
      expect(error).toBeUndefined();
    }

    expect(thrown).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const handle = createAutomergeHandle<Root>();
    const listener = vi.fn();
    const unsubscribe = handle.subscribe(listener);

    unsubscribe();
    handle.change((doc) => {
      doc.count = 1;
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
