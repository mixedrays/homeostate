import * as Y from "yjs";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { SYNC_MAP_NAME } from "../sync";

export interface Point {
  x: number;
  y: number;
}

interface ShapeBase {
  /** The top-left corner of a box or text, or the tail of an arrow, in board pixels. */
  x: number;
  y: number;
  /** Stacking order: higher is drawn on top, and ties fall back to the id. */
  z: number;
  /**
   * An index into PALETTE. Colours are numbers because homeostate syncs a string as a Y.Text
   * and merges it character by character: two tabs recolouring one shape at once would blend
   * "#dc2626" and "#16a34a" into neither. A number is replaced whole, so one of them wins.
   */
  color: number;
}

export interface BoxShape extends ShapeBase {
  kind: "box";
  w: number;
  h: number;
  /** An index into PALETTE for the fill tint, or null for no fill. */
  fill: number | null;
}

export interface ArrowShape extends ShapeBase {
  kind: "arrow";
  /** The head, relative to the tail. */
  dx: number;
  dy: number;
}

export interface TextShape extends ShapeBase {
  kind: "text";
  /** Synced as a Y.Text, so two people typing into one text merge. */
  text: string;
}

export type Shape = BoxShape | ArrowShape | TextShape;

/**
 * The synced state: every shape keyed by its id. A record rather than an array, so tabs adding
 * or deleting shapes at once each touch their own key, and two tabs editing one shape merge
 * field by field: one moves it while the other recolours it, and both changes stay.
 */
export interface Board {
  shapes: Record<string, Shape>;
}

/** What a new shape is drawn with, and what the toolbar changes on the selected shape. */
export interface Style {
  color: number;
  fill: number | null;
}

export interface Swatch {
  name: string;
  /** For outlines, arrows and text. */
  stroke: string;
  /** A light tint of the same colour, for box fills. */
  fill: string;
}

export const PALETTE: readonly Swatch[] = [
  { name: "Ink", stroke: "#1e293b", fill: "#f1f5f9" },
  { name: "Blue", stroke: "#2563eb", fill: "#dbeafe" },
  { name: "Red", stroke: "#dc2626", fill: "#fee2e2" },
  { name: "Green", stroke: "#16a34a", fill: "#dcfce7" },
  { name: "Amber", stroke: "#d97706", fill: "#fef3c7" },
  { name: "Violet", stroke: "#7c3aed", fill: "#ede9fe" },
  { name: "Pink", stroke: "#db2777", fill: "#fce7f3" },
  { name: "Teal", stroke: "#0d9488", fill: "#ccfbf1" },
];

const isPaletteIndex = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < PALETTE.length;

/** The swatch a shape's colour names, or the first one if a peer stored something else. */
export const swatch = (color: unknown): Swatch =>
  isPaletteIndex(color) ? PALETTE[color] : PALETTE[0];

/** The swatch of a box's fill, or null for none. */
export const fillSwatch = (fill: unknown): Swatch | null =>
  isPaletteIndex(fill) ? PALETTE[fill] : null;

export const DEFAULT_STYLE: Style = { color: 0, fill: null };

/** Boxes and arrows drawn with a click instead of a drag get these sizes. */
export const DEFAULT_BOX = { w: 160, h: 96 };
export const DEFAULT_ARROW = { dx: 120, dy: 0 };

/** The board scrolls inside the window; every tab has the same one, so points line up. */
export const BOARD_SIZE = { width: 3200, height: 2000 };

export const INITIAL_SHAPES: Record<string, Shape> = {
  welcome: {
    kind: "text",
    x: 96,
    y: 96,
    z: 0,
    color: 0,
    text: "Plan together: draw boxes, arrows and text.",
  },
  start: {
    kind: "box",
    x: 96,
    y: 160,
    z: 1,
    w: 200,
    h: 104,
    color: 1,
    fill: 1,
  },
  "start-label": {
    kind: "text",
    x: 116,
    y: 198,
    z: 2,
    color: 1,
    text: "Open a second tab",
  },
  next: { kind: "arrow", x: 312, y: 212, z: 3, dx: 120, dy: 0, color: 0 },
  finish: {
    kind: "box",
    x: 448,
    y: 160,
    z: 4,
    w: 200,
    h: 104,
    color: 3,
    fill: 3,
  },
  "finish-label": {
    kind: "text",
    x: 486,
    y: 198,
    z: 5,
    color: 3,
    text: "Draw in both",
  },
};

/**
 * Gives `doc` the starting shapes as one update authored by a fixed client id, before it syncs.
 *
 * Every tab applies the very same update, so a tab joining a room that already has it adds
 * nothing. If each tab wrote its own `shapes` map instead, the room would hold two maps on one
 * key; Yjs keeps whichever client id sorts last and drops the other with every edit made to it,
 * so a new tab would reset the board about half the time.
 */
export function seedBoard(doc: Y.Doc): void {
  const seed = new Y.Doc();
  try {
    seed.clientID = 0;
    createYjsBackend(seed, SYNC_MAP_NAME).write({ shapes: INITIAL_SHAPES });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
  } finally {
    seed.destroy();
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Whether a stored value can be drawn. The record holds whatever peers and the devtools put
 * there, so it is checked before it reaches the page. Colours are not: `swatch` falls back.
 */
export function isShape(value: unknown): value is Shape {
  if (value === null || typeof value !== "object") return false;
  const shape = value as Record<string, unknown>;
  if (![shape.x, shape.y, shape.z].every(isFiniteNumber)) return false;
  switch (shape.kind) {
    case "box":
      return isFiniteNumber(shape.w) && isFiniteNumber(shape.h);
    case "arrow":
      return isFiniteNumber(shape.dx) && isFiniteNumber(shape.dy);
    case "text":
      return typeof shape.text === "string";
    default:
      return false;
  }
}

export interface ShapeEntry {
  id: string;
  shape: Shape;
}

/**
 * The shapes to draw, bottom first, in the same order in every tab. Each shape is the store's
 * own object, so a shape that did not change keeps its identity and its memoized view.
 */
export function readShapes(shapes: Record<string, unknown>): ShapeEntry[] {
  const entries: ShapeEntry[] = [];
  for (const [id, shape] of Object.entries(shapes))
    if (isShape(shape)) entries.push({ id, shape });
  return entries.sort(
    (a, b) => a.shape.z - b.shape.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** A z above every shape, for a new shape to land on top. */
export const nextZ = (shapes: Record<string, unknown>): number =>
  readShapes(shapes).reduce((top, { shape }) => Math.max(top, shape.z + 1), 0);

/**
 * Short ids keep the state readable in the devtools; a clash between tabs is unlikely. Not
 * `crypto.randomUUID`, which is missing when the dev server is opened over a LAN address.
 */
export const newShapeId = (): string =>
  Math.random().toString(36).slice(2, 10).padEnd(8, "0");

export function createShape(
  kind: Shape["kind"],
  at: Point,
  style: Style,
  z: number,
): Shape {
  const base = { x: at.x, y: at.y, z, color: style.color };
  switch (kind) {
    case "box":
      return { ...base, kind, w: 0, h: 0, fill: style.fill };
    case "arrow":
      return { ...base, kind, dx: 0, dy: 0 };
    case "text":
      return { ...base, kind, text: "" };
  }
}

/** The shape restyled. A fill only applies to boxes. */
export function applyStyle(shape: Shape, style: Partial<Style>): Shape {
  const color = style.color ?? shape.color;
  if (shape.kind !== "box") return { ...shape, color };
  return {
    ...shape,
    color,
    fill: style.fill === undefined ? shape.fill : style.fill,
  };
}

/** The rectangle two corners span, whichever way the drag went. */
export const rectBetween = (a: Point, b: Point) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});
