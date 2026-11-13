import { LoroDoc, LoroList, LoroMap, LoroText } from "loro-crdt";
import { describe, expect, it } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import {
  createTestStore,
  describeCrdtBackend,
} from "@homeostate/core/conformance";
import { createLoroBackend, createLoroPersistable } from "../index.js";
import { textDeletePanicSnapshot } from "./fixtures/text-delete-panic.js";

const NAME = "shared";

/** The value at `path` from the synced map, a container or a plain value. */
const at = (doc: LoroDoc, path: (string | number)[]): unknown =>
  path.reduce<unknown>(
    (container, key) =>
      container instanceof LoroMap
        ? container.get(key as string)
        : (container as LoroList).get(key as number),
    doc.getMap(NAME),
  );

/** A container for `value` if it is an object or an array, every key kept, else `undefined`. */
const containerFor = (value: unknown): LoroMap | LoroList | undefined =>
  Array.isArray(value)
    ? new LoroList()
    : value !== null && typeof value === "object"
      ? new LoroMap()
      : undefined;

/** Fills the attached `container` with `value`'s entries, building containers at any depth. */
const fill = (container: LoroMap | LoroList, value: object): void => {
  Object.entries(value).forEach(([key, item]) => {
    const child = containerFor(item);
    if (container instanceof LoroList) {
      if (child) fill(container.insertContainer(Number(key), child), item);
      else container.insert(Number(key), item);
    } else if (child) fill(container.setContainer(key, child), item);
    else container.set(key, item);
  });
};

describeCrdtBackend("createLoroBackend", {
  createDoc: (id) => {
    const doc = new LoroDoc();
    if (id !== undefined) doc.setPeerId(id);
    return doc;
  },
  backend: (doc, options) => createLoroBackend(doc, NAME, options),
  exchange: (a, b) => {
    b.import(a.export({ mode: "update", from: b.version() }));
    a.import(b.export({ mode: "update", from: a.version() }));
  },
  onLocalUpdate: (doc, listener) => doc.subscribeLocalUpdates(listener),
  storeForeign: (doc, key, value) => {
    doc.getMap(NAME).set(key, value);
    doc.commit();
  },
  storeForeignContainers: (doc, key, value) => {
    fill(doc.getMap(NAME), { [key]: value });
    doc.commit();
  },
  containerId: (doc, path) => (at(doc, path) as LoroMap | LoroList).id,
  isText: (doc, path) => at(doc, path) instanceof LoroText,
});

describe("createLoroBackend", () => {
  it("moves its revision with an edit other code has not committed", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write({ count: 1 });
    const before = backend.revision();

    // Reported only once committed.
    doc.getMap(NAME).set("count", 2);

    expect(backend.revision()).not.toBe(before);
  });

  it("has no revision while checked out, and its latest one again after", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write({ count: 1 });
    const earlier = doc.frontiers();
    backend.write({ count: 2 });
    const latest = backend.revision();

    doc.checkout(earlier);
    expect(backend.revision()).toBeUndefined();
    doc.checkoutToLatest();

    expect(backend.revision()).toBe(latest);
  });

  // loro-crdt before 1.16.4 panics at commit on this delete when the document has a subscriber,
  // which the engine always adds, and every later call on the document throws.
  it("deletes a text in a restored document while the engine is connected", () => {
    const doc = new LoroDoc();
    createLoroPersistable(doc).apply(textDeletePanicSnapshot());
    const errors: unknown[] = [];
    const store = createTestStore<Record<string, unknown>>({});
    createSyncEngine(
      createLoroBackend(doc, NAME, { text: () => true }),
      store.adapter,
      { onError: (error, source) => errors.push([source, error]) },
    ).connect();
    expect(store.getState().chaos).toBe("🙂y");

    store.update((state) => ({ ...state, chaos: "" }));
    store.update((state) => ({ ...state, log: "after" }));

    expect(errors).toEqual([]);
    expect(doc.getMap(NAME).toJSON()).toMatchObject({
      chaos: "",
      log: "after",
    });
  });

  describe("a store edit merged into a pending apply that moved and changed its row", () => {
    type Row = { id: string; cells: Record<string, number> };
    const row = (id: string, cells: Record<string, number> = {}): Row => ({
      id,
      cells,
    });
    const exchange = (a: LoroDoc, b: LoroDoc): void => {
      b.import(a.export({ mode: "update", from: b.version() }));
      a.import(b.export({ mode: "update", from: a.version() }));
    };

    it.each([
      {
        change: "an insert and an edit",
        base: [row("r1")],
        remote: [row("r0"), row("r1", { b: 1 })],
        expected: [row("r0"), row("r1", { b: 1, a: 2 })],
      },
      {
        change: "a delete and an edit",
        base: [row("r0"), row("r1")],
        remote: [row("r1", { b: 1 })],
        expected: [row("r1", { b: 1, a: 2 })],
      },
      {
        change: "an insert only",
        base: [row("r1")],
        remote: [row("r0"), row("r1")],
        expected: [row("r0"), row("r1", { a: 2 })],
      },
    ])(
      "lands on its row after $change from the other peer",
      async ({ base, remote, expected }) => {
        const a = new LoroDoc();
        a.setPeerId(1);
        const b = new LoroDoc();
        b.setPeerId(2);
        const backendB = createLoroBackend(b, NAME);
        backendB.write({ rows: base });
        exchange(b, a);
        const store = createTestStore<{ rows: Row[] }>({ rows: [] });
        createSyncEngine(createLoroBackend(a, NAME), store.adapter, {
          schedule: queueMicrotask,
        }).connect();

        backendB.write({ rows: remote }, { rows: base });
        exchange(b, a);
        // The apply waits for its microtask, so the store edits r1 before it runs.
        expect(store.getState().rows).toEqual(base);
        store.update((s) => ({
          rows: s.rows.map((r) =>
            r.id === "r1" ? { ...r, cells: { ...r.cells, a: 2 } } : r,
          ),
        }));
        await Promise.resolve();
        exchange(a, b);

        expect(store.getState().rows).toEqual(expected);
        expect(a.getMap(NAME).toJSON()).toEqual({ rows: expected });
        expect(b.getMap(NAME).toJSON()).toEqual({ rows: expected });
      },
    );
  });
});
