import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { Peer } from "../board/presence";
import {
  BOARD_SIZE,
  createShape,
  DEFAULT_ARROW,
  DEFAULT_BOX,
  newShapeId,
  nextZ,
  rectBetween,
  type Point,
  type Shape,
  type ShapeEntry,
  type Style,
} from "../board/shapes";
import { useBoardStore } from "../board/store";
import type { Tool } from "../board/tools";
import { RemoteCursors } from "./RemoteCursors";
import { ShapeView, type Handle } from "./ShapeView";

/** What the pointer is doing between press and release. */
type Drag =
  | { type: "move"; id: string; from: Point; origin: Point }
  | { type: "draw"; id: string; from: Point }
  /** `anchor` is the box corner across from the one being dragged. */
  | { type: "corner"; id: string; anchor: Point }
  /** `fixed` is the end of the arrow that stays put. */
  | { type: "tail" | "head"; id: string; fixed: Point }
  | { type: "place-text" };

/** A drag shorter than this is a click. */
const CLICK_DISTANCE = 4;

/** Text is placed so its first line is centred on the click. */
const textOrigin = ({ x, y }: Point): Point => ({ x: x - 4, y: y - 14 });

interface BoardProps {
  shapes: readonly ShapeEntry[];
  tool: Tool;
  style: Style;
  selectedId: string | null;
  editingId: string | null;
  peers: readonly Peer[];
  onSelect: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  /** A shape was drawn: the board hands back to the select tool. */
  onDrawn: () => void;
  /** The pointer moved on the board, or left it. */
  onPointer: (point: Point | null) => void;
}

const { addShape, updateShape, removeShape } = useBoardStore.getState();

/** The rest of a drag, applied to the shape as it is now so others' edits to it stay. */
function dragShape(shape: Shape, drag: Drag, point: Point): Shape {
  switch (drag.type) {
    case "move":
      return {
        ...shape,
        x: drag.origin.x + point.x - drag.from.x,
        y: drag.origin.y + point.y - drag.from.y,
      };
    case "draw":
      if (shape.kind === "box")
        return { ...shape, ...rectBetween(drag.from, point) };
      if (shape.kind === "arrow")
        return { ...shape, dx: point.x - shape.x, dy: point.y - shape.y };
      return shape;
    case "corner":
      return shape.kind === "box"
        ? { ...shape, ...rectBetween(drag.anchor, point) }
        : shape;
    case "tail":
      return shape.kind === "arrow"
        ? {
            ...shape,
            x: point.x,
            y: point.y,
            dx: drag.fixed.x - point.x,
            dy: drag.fixed.y - point.y,
          }
        : shape;
    case "head":
      return shape.kind === "arrow"
        ? { ...shape, dx: point.x - shape.x, dy: point.y - shape.y }
        : shape;
    case "place-text":
      return shape;
  }
}

/** A box or arrow drawn with a click instead of a drag gets a default size. */
function finishDrawing(shape: Shape): Shape {
  if (
    shape.kind === "box" &&
    shape.w < CLICK_DISTANCE &&
    shape.h < CLICK_DISTANCE
  )
    return { ...shape, ...DEFAULT_BOX };
  if (shape.kind === "arrow" && Math.hypot(shape.dx, shape.dy) < CLICK_DISTANCE)
    return { ...shape, ...DEFAULT_ARROW };
  return shape;
}

/** Where a drag of `handle` on the selected shape starts. */
function grab(id: string, shape: Shape, handle: Handle): Drag | null {
  if (shape.kind === "box") {
    const left = handle === "nw" || handle === "sw";
    const top = handle === "nw" || handle === "ne";
    return {
      type: "corner",
      id,
      anchor: {
        x: left ? shape.x + shape.w : shape.x,
        y: top ? shape.y + shape.h : shape.y,
      },
    };
  }
  if (shape.kind === "arrow" && (handle === "tail" || handle === "head")) {
    const fixed =
      handle === "tail"
        ? { x: shape.x + shape.dx, y: shape.y + shape.dy }
        : { x: shape.x, y: shape.y };
    return { type: handle, id, fixed };
  }
  return null;
}

/**
 * The drawing surface: a fixed-size board that scrolls inside the window. Points are in the
 * board's own pixels, so they mean the same spot in every tab whatever its window size.
 *
 * Every step of a drag goes straight to the store, so others watch shapes move and grow
 * rather than jump into place on release.
 */
export function Board({
  shapes,
  tool,
  style,
  selectedId,
  editingId,
  peers,
  onSelect,
  onEdit,
  onDrawn,
  onPointer,
}: BoardProps) {
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const last = useRef<Point | null>(null);

  const toBoard = (event: { clientX: number; clientY: number }): Point => {
    const rect = board.current!.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    };
  };

  const startText = (at: Point) => {
    const id = newShapeId();
    const z = nextZ(useBoardStore.getState().shapes);
    addShape(id, createShape("text", textOrigin(at), style, z));
    onSelect(id);
    onEdit(id);
    onDrawn();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (event.button !== 0 || target.closest("[data-editor]")) return;
    const point = toBoard(event);
    last.current = point;

    if (tool === "select") {
      const handle = target.closest<HTMLElement>("[data-handle]")?.dataset
        .handle as Handle | undefined;
      const hit =
        target.closest<HTMLElement>("[data-shape-id]")?.dataset.shapeId;
      const record = useBoardStore.getState().shapes;
      if (handle && selectedId && record[selectedId]) {
        drag.current = grab(selectedId, record[selectedId], handle);
      } else if (hit && record[hit]) {
        onSelect(hit);
        drag.current = {
          type: "move",
          id: hit,
          from: point,
          origin: { x: record[hit].x, y: record[hit].y },
        };
      } else {
        onSelect(null);
        return;
      }
    } else if (tool === "text") {
      // Placed on release: focusing the new text now would lose to the press moving focus.
      drag.current = { type: "place-text" };
    } else {
      const id = newShapeId();
      const z = nextZ(useBoardStore.getState().shapes);
      addShape(id, createShape(tool, point, style, z));
      onSelect(id);
      drag.current = { type: "draw", id, from: point };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = toBoard(event);
    onPointer(point);
    const current = drag.current;
    if (!current || current.type === "place-text") return;
    if (last.current?.x === point.x && last.current.y === point.y) return;
    last.current = point;
    updateShape(current.id, (shape) => dragShape(shape, current, point));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    if (current?.type === "draw") {
      updateShape(current.id, finishDrawing);
      onDrawn();
    } else if (current?.type === "place-text" && event.type === "pointerup") {
      startText(toBoard(event));
    }
  };

  /** Double-click a text to edit it, or anywhere else to write a new one. */
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (tool !== "select" || target.closest("[data-editor], [data-handle]"))
      return;
    const hit = target.closest<HTMLElement>("[data-shape-id]")?.dataset.shapeId;
    const shape = hit ? useBoardStore.getState().shapes[hit] : undefined;
    if (hit && shape?.kind === "text") {
      onSelect(hit);
      onEdit(hit);
    } else {
      startText(toBoard(event));
    }
  };

  const onTextChange = useCallback(
    (id: string, text: string) =>
      updateShape(id, (shape) =>
        shape.kind === "text" ? { ...shape, text } : shape,
      ),
    [],
  );

  /** A text left empty is removed rather than left as an invisible shape. */
  const onTextDone = useCallback(
    (id: string) => {
      const shape = useBoardStore.getState().shapes[id];
      if (shape?.kind === "text" && shape.text.trim() === "") {
        removeShape(id);
        onSelect(null);
      }
      onEdit(null);
    },
    [onEdit, onSelect],
  );

  /** Shapes someone else has selected, in that person's colour. */
  const remoteSelections = new Map<string, string>();
  for (const peer of peers)
    if (!peer.isLocal && peer.selected)
      remoteSelections.set(peer.selected, peer.color);

  return (
    <div className="absolute inset-0 overflow-auto bg-paper">
      <div
        ref={board}
        data-tool={tool}
        className={cn(
          "relative touch-none select-none",
          tool === "text"
            ? "cursor-text"
            : tool !== "select" && "cursor-crosshair",
        )}
        style={{
          width: BOARD_SIZE.width,
          height: BOARD_SIZE.height,
          backgroundImage:
            "radial-gradient(circle, var(--color-border) 1.2px, transparent 1.2px)",
          backgroundSize: "24px 24px",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => onPointer(null)}
        onDoubleClick={onDoubleClick}
      >
        {shapes.map(({ id, shape }) => (
          <ShapeView
            key={id}
            id={id}
            shape={shape}
            selected={id === selectedId}
            remoteColor={remoteSelections.get(id)}
            editing={id === editingId}
            onTextChange={onTextChange}
            onTextDone={onTextDone}
          />
        ))}
        <RemoteCursors peers={peers} />
      </div>
    </div>
  );
}
