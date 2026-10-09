import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createStore } from "zustand/vanilla";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import { readPeers, type Awareness } from "../board/presence";
import {
  applyStyle,
  INITIAL_SHAPES,
  isShapeText,
  nextZ,
  readShapes,
  seedBoard,
  type Board,
  type Shape,
} from "../board/shapes";
import { SYNC_MAP_NAME } from "../sync";

/** Teardown for whatever the current test opened, run whether it passes or fails. */
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** Carries every update from each document to the other, the way the sync server would. */
const link = (a: Y.Doc, b: Y.Doc) => {
  const relay = Symbol("relay");
  const forward = (to: Y.Doc) => (update: Uint8Array, origin: unknown) => {
    if (origin !== relay) Y.applyUpdate(to, update, relay);
  };
  const toB = forward(b);
  const toA = forward(a);
  a.on("update", toB);
  b.on("update", toA);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), relay);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b), relay);
  cleanups.push(() => {
    a.off("update", toB);
    b.off("update", toA);
  });
};

/** One tab of the board, wired like the demo: a store synced into a seeded document. */
const openTab = () => {
  const doc = new Y.Doc();
  seedBoard(doc);
  const store = createStore<Board>(() => ({ shapes: {} }));
  const engine = createSyncEngine(
    createYjsBackend(doc, SYNC_MAP_NAME, { text: isShapeText }),
    createZustandAdapter(store),
  );
  engine.connect();
  cleanups.push(() => engine.disconnect());
  return {
    doc,
    shapes: () => store.getState().shapes,
    update: (id: string, update: (shape: Shape) => Shape) =>
      store.setState({
        shapes: {
          ...store.getState().shapes,
          [id]: update(store.getState().shapes[id]),
        },
      }),
    add: (id: string, shape: Shape) =>
      store.setState({ shapes: { ...store.getState().shapes, [id]: shape } }),
  };
};

const sharedShapes = (doc: Y.Doc) =>
  (doc.getMap(SYNC_MAP_NAME).get("shapes") as Y.Map<unknown>).toJSON();

describe("the shared board", () => {
  it("keeps a room's edits when a new tab joins it, whichever client id sorts last", () => {
    // Were the seeds separate maps, the one with the higher client id would win the key and
    // replace the room's shapes, about one join in two.
    for (let run = 0; run < 32; run++) {
      const room = new Y.Doc();
      seedBoard(room);
      const shapes = room.getMap(SYNC_MAP_NAME).get("shapes") as Y.Map<unknown>;
      shapes.delete("welcome");

      const joining = new Y.Doc();
      seedBoard(joining);
      link(room, joining);

      expect(Object.keys(sharedShapes(joining)).sort()).toEqual(
        Object.keys(INITIAL_SHAPES)
          .filter((id) => id !== "welcome")
          .sort(),
      );
    }
  });

  it("keeps both a move and a recolour two tabs make to one shape while apart", () => {
    const a = openTab();
    const b = openTab();

    a.update("start", (shape) => ({ ...shape, x: 300, y: 400 }));
    b.update("start", (shape) => applyStyle(shape, { color: 2, fill: null }));
    link(a.doc, b.doc);

    const expected = {
      ...INITIAL_SHAPES.start,
      x: 300,
      y: 400,
      color: 2,
      fill: null,
    };
    expect(a.shapes().start).toEqual(expected);
    expect(b.shapes().start).toEqual(expected);
  });

  it("settles on one whole colour when two tabs pick different ones at once", () => {
    const a = openTab();
    const b = openTab();

    a.update("start", (shape) => applyStyle(shape, { color: 2 }));
    b.update("start", (shape) => applyStyle(shape, { color: 5 }));
    link(a.doc, b.doc);

    expect([2, 5]).toContain(a.shapes().start.color);
    expect(b.shapes().start.color).toBe(a.shapes().start.color);
  });

  it("merges what two tabs type into one text at the same time", () => {
    const a = openTab();
    const b = openTab();
    const text = (INITIAL_SHAPES["finish-label"] as { text: string }).text;

    a.update("finish-label", (shape) =>
      shape.kind === "text" ? { ...shape, text: `${shape.text}!` } : shape,
    );
    b.update("finish-label", (shape) =>
      shape.kind === "text" ? { ...shape, text: `Now: ${shape.text}` } : shape,
    );
    link(a.doc, b.doc);

    expect(a.shapes()["finish-label"]).toMatchObject({ text: `Now: ${text}!` });
    expect(b.shapes()["finish-label"]).toEqual(a.shapes()["finish-label"]);
  });

  it("keeps shapes two tabs add at once, stacked the same way in both", () => {
    const a = openTab();
    const b = openTab();
    const z = nextZ(a.shapes());

    a.add("from-a", {
      kind: "box",
      x: 0,
      y: 0,
      z,
      w: 10,
      h: 10,
      color: 1,
      fill: null,
    });
    b.add("from-b", { kind: "arrow", x: 0, y: 0, z, dx: 10, dy: 0, color: 3 });
    link(a.doc, b.doc);

    const order = (shapes: Board["shapes"]) =>
      readShapes(shapes).map(({ id }) => id);
    expect(order(a.shapes()).slice(-2)).toEqual(["from-a", "from-b"]);
    expect(order(b.shapes())).toEqual(order(a.shapes()));
  });
});

describe("readShapes", () => {
  it("draws bottom first and skips what it cannot draw", () => {
    const box = {
      kind: "box",
      x: 0,
      y: 0,
      z: 2,
      w: 5,
      h: 5,
      color: 0,
      fill: null,
    };
    const text = { kind: "text", x: 0, y: 0, z: 1, color: 0, text: "hi" };

    const entries = readShapes({
      box,
      text,
      noKind: { x: 0, y: 0, z: 0 },
      badSize: { ...box, w: "wide" },
      notANumber: { ...text, x: Number.NaN },
      missing: null,
    });

    expect(entries.map(({ id }) => id)).toEqual(["text", "box"]);
    // The store's own objects, so unchanged shapes keep their memoized views.
    expect(entries[1].shape).toBe(box);
  });

  it("puts a new shape above the rest", () => {
    expect(nextZ({})).toBe(0);
    expect(nextZ(INITIAL_SHAPES)).toBe(6);
  });
});

describe("applyStyle", () => {
  it("only gives boxes a fill", () => {
    const arrow: Shape = {
      kind: "arrow",
      x: 0,
      y: 0,
      z: 0,
      dx: 1,
      dy: 1,
      color: 0,
    };
    expect(applyStyle(arrow, { color: 3, fill: 2 })).toEqual({
      ...arrow,
      color: 3,
    });
    expect(applyStyle(INITIAL_SHAPES.start, { fill: null })).toMatchObject({
      color: 1,
      fill: null,
    });
  });
});

describe("readPeers", () => {
  const awarenessOf = (states: Record<number, Record<string, unknown>>) =>
    ({
      clientID: 2,
      getStates: () =>
        new Map(
          Object.entries(states).map(([id, state]) => [Number(id), state]),
        ),
    }) as unknown as Awareness;

  it("lists only tabs that joined, this one first, with what they sent checked", () => {
    const peers = readPeers(
      awarenessOf({
        // Still choosing a name: not on the board yet.
        1: { pointer: { x: 1, y: 1 } },
        3: {
          user: { name: "x".repeat(100), color: "red", anonymous: "yes" },
          pointer: { x: "1", y: 2 },
          selected: 7,
        },
        2: {
          user: { name: "Ada", color: "#2563eb", anonymous: false },
          pointer: { x: 10, y: 20 },
          selected: "start",
        },
      }),
    );

    expect(peers).toEqual([
      {
        clientId: 2,
        isLocal: true,
        name: "Ada",
        color: "#2563eb",
        anonymous: false,
        pointer: { x: 10, y: 20 },
        selected: "start",
      },
      {
        clientId: 3,
        isLocal: false,
        name: "x".repeat(32),
        color: "#64748b",
        anonymous: false,
        pointer: null,
        selected: null,
      },
    ]);
  });
});
