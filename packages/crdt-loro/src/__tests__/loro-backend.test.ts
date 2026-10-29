import { LoroDoc, LoroList, LoroMap, LoroText } from "loro-crdt";
import { describe, expect, it } from "vitest";
import { describeCrdtBackend } from "@homeostate/core/conformance";
import { createLoroBackend } from "../index.js";

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
    const before = backend.revision?.();

    // Reported only once committed.
    doc.getMap(NAME).set("count", 2);

    expect(backend.revision?.()).not.toBe(before);
  });

  it("has no revision while checked out, and its latest one again after", () => {
    const doc = new LoroDoc();
    const backend = createLoroBackend(doc, NAME);
    backend.write({ count: 1 });
    const earlier = doc.frontiers();
    backend.write({ count: 2 });
    const latest = backend.revision?.();

    doc.checkout(earlier);
    expect(backend.revision?.()).toBeUndefined();
    doc.checkoutToLatest();

    expect(backend.revision?.()).toBe(latest);
  });
});
