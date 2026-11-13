import { describe, expect, it, vi } from "vitest";
import {
  createCrdtBackend,
  createSyncEngine,
  type ApplyOps,
  type CrdtBackendParts,
  type JsonObject,
  type TextPolicy,
} from "../index.js";
import { createTestStore, threeTodos, todo } from "./helpers.js";

type Plain = Record<string, unknown>;

/** Ops over plain objects and arrays, with every string a plain value. */
const plainOps: ApplyOps = {
  kind: (value) =>
    Array.isArray(value)
      ? "list"
      : value !== null && typeof value === "object"
        ? "record"
        : undefined,
  get: (container, key) => (container as Plain)[key],
  set: (container, key, value) => {
    (container as Plain)[key] = structuredClone(value);
  },
  remove: (container, key) => {
    delete (container as Plain)[key];
  },
  splice: (list, index, deleteCount, inserted) => {
    (list as unknown[]).splice(
      index,
      deleteCount,
      ...structuredClone(inserted),
    );
  },
};

/**
 * A document of plain objects whose synced root may be missing, and which tells every listener
 * whether a change was made by the backend's own transaction.
 */
const createDoc = (root?: unknown) => {
  const doc = {
    root,
    changes: 0,
    reads: 0,
    listeners: new Set<(own: boolean) => void>(),
    /** A change by other code. */
    edit: (key: string, value: unknown) => {
      (doc.root as Plain)[key] = value;
      doc.changes++;
      doc.listeners.forEach((listener) => listener(false));
    },
  };
  return doc;
};

type Doc = ReturnType<typeof createDoc>;

const partsOver = (
  doc: Doc,
  extra: Partial<CrdtBackendParts> = {},
  ops: ApplyOps = plainOps,
): CrdtBackendParts => ({
  read: () => {
    doc.reads++;
    return structuredClone((doc.root as JsonObject | undefined) ?? {});
  },
  transact: (edit) => {
    const created =
      doc.root === null ||
      typeof doc.root !== "object" ||
      Array.isArray(doc.root);
    if (created) doc.root = {};
    edit(doc.root as object, ops, created);
    doc.changes++;
    doc.listeners.forEach((listener) => listener(true));
  },
  watch: (onChange) => {
    doc.listeners.add(onChange);
    return () => {
      doc.listeners.delete(onChange);
    };
  },
  revision: () => undefined,
  ...extra,
});

/** `plainOps` with every string a text, whose edits `editText` records instead of making. */
const textOps = () => ({
  ...plainOps,
  kind: (value: unknown) =>
    typeof value === "string" ? ("text" as const) : plainOps.kind(value),
  editText: vi.fn(),
});

describe("createCrdtBackend", () => {
  it("replaces every changed string whole without a text policy", () => {
    const doc = createDoc({ title: "a", note: "a" });
    const ops = textOps();
    const backend = createCrdtBackend(partsOver(doc, {}, ops));

    backend.write({ title: "ab", note: "ab" }, { title: "a", note: "a" });

    expect(ops.editText).not.toHaveBeenCalled();
    expect(doc.root).toEqual({ title: "ab", note: "ab" });
  });

  it("edits the strings its text policy marks in place, and replaces the others whole", () => {
    const doc = createDoc({ title: "a", note: "a" });
    const ops = textOps();
    const text: TextPolicy = (path) => path[0] === "title";
    const backend = createCrdtBackend({ ...partsOver(doc, {}, ops), text });

    backend.write({ title: "ab", note: "ab" }, { title: "a", note: "a" });

    expect(ops.editText).toHaveBeenCalledTimes(1);
    expect(ops.editText).toHaveBeenCalledWith("a", 1, 0, "b", ["title"]);
    expect(doc.root).toEqual({ title: "a", note: "ab" });
  });

  it("writes through transact, so that read() matches", () => {
    const doc = createDoc({});
    const backend = createCrdtBackend(partsOver(doc));

    backend.write({ list: [1, 2], nested: { a: "x" } });

    expect(backend.read()).toEqual({ list: [1, 2], nested: { a: "x" } });
    expect(doc.root).toEqual({ list: [1, 2], nested: { a: "x" } });
  });

  it("diffs against previous without reading its document", () => {
    const doc = createDoc({ count: 1, label: "a" });
    const backend = createCrdtBackend(partsOver(doc));
    // Unreported, so a `previous` that misses it shows which side the write diffed against.
    (doc.root as Plain).count = 2;
    doc.reads = 0;

    backend.write({ count: 1, label: "b" }, { count: 1, label: "a" });

    expect(doc.reads).toBe(0);
    expect(doc.root).toEqual({ count: 2, label: "b" });
  });

  it("reads its document once when the sync engine seeds the keys it lacks", () => {
    const doc = createDoc({ todos: [todo("remote")] });
    const backend = createCrdtBackend(partsOver(doc));
    const store = createTestStore(threeTodos());

    createSyncEngine({ backend, adapter: store.adapter }).connect();

    expect(doc.reads).toBe(1);
    expect(doc.root).toEqual({ ...threeTodos(), todos: [todo("remote")] });
  });

  it("diffs against its document without previous", () => {
    const doc = createDoc({ count: 1, label: "a" });
    const backend = createCrdtBackend(partsOver(doc));
    (doc.root as Plain).count = 2;

    backend.write({ count: 1, label: "b" });

    expect(doc.root).toEqual({ count: 1, label: "b" });
  });

  it.each([
    ["missing", undefined],
    ["a string", "text"],
    ["a list", [1]],
  ])(
    "diffs against an empty object, reading nothing, when transact creates a root that was %s",
    (_, held) => {
      const doc = createDoc(held);
      const backend = createCrdtBackend(
        partsOver(doc, {
          read: () => {
            throw new TypeError("not a map");
          },
        }),
      );

      backend.write({ count: 1 }, { count: 1 });

      expect(doc.root).toEqual({ count: 1 });
    },
  );

  it("writes as JSON would store it", () => {
    const doc = createDoc({});
    const backend = createCrdtBackend(partsOver(doc));

    backend.write({
      a: undefined,
      f: () => {},
      n: Number.NaN,
      list: [undefined],
    });

    expect(doc.root).toStrictEqual({ n: null, list: [null] });
  });

  it("reports only the changes watch does not call its own", () => {
    const doc = createDoc({});
    const backend = createCrdtBackend(partsOver(doc));
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    backend.write({ count: 1 });
    expect(onRemoteChange).not.toHaveBeenCalled();
    doc.edit("count", 2);

    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ count: 2 });
  });

  it("stops watching once unsubscribed", () => {
    const doc = createDoc({});
    const unsubscribe = createCrdtBackend(partsOver(doc)).subscribe(() => {});

    unsubscribe();

    expect(doc.listeners.size).toBe(0);
  });

  it("has the revision its parts give", () => {
    const doc = createDoc({});
    const backend = createCrdtBackend(
      partsOver(doc, { revision: () => doc.changes }),
    );

    expect(backend.revision()).toBe(0);
    backend.write({ count: 1 });
    expect(backend.revision()).toBe(1);
  });
});
