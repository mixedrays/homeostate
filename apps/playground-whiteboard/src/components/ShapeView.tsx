import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { cn } from "@/lib/utils";
import {
  fillSwatch,
  swatch,
  type ArrowShape,
  type BoxShape,
  type ShapeEntry,
  type TextShape,
} from "../board/shapes";

/** Which part of the selected shape a drag grabbed: a box corner or an arrow end. */
export type Handle = "nw" | "ne" | "sw" | "se" | "tail" | "head";

interface ShapeViewProps extends ShapeEntry {
  selected: boolean;
  /** The colour of someone else who has this shape selected. */
  remoteColor: string | undefined;
  editing: boolean;
  onTextChange: (id: string, text: string) => void;
  onTextDone: (id: string) => void;
}

/**
 * One shape on the board. Every shape is an absolutely placed element in the board's own
 * pixels, drawn in z order, so boxes, arrows and text stack the same way in every tab.
 * Pointer handling lives on the board: it finds the shape by `data-shape-id` and the grabbed
 * handle by `data-handle`.
 */
export const ShapeView = memo(function ShapeView({
  id,
  shape,
  ...props
}: ShapeViewProps) {
  switch (shape.kind) {
    case "box":
      return <BoxView id={id} shape={shape} {...props} />;
    case "arrow":
      return <ArrowView id={id} shape={shape} {...props} />;
    case "text":
      return <TextView id={id} shape={shape} {...props} />;
  }
});

/** The local selection is solid in the accent colour; someone else's is dashed in theirs. */
const outline = (
  selected: boolean,
  remoteColor: string | undefined,
): CSSProperties =>
  selected
    ? { outline: "2px solid var(--primary)", outlineOffset: 3 }
    : remoteColor
      ? { outline: `2px dashed ${remoteColor}`, outlineOffset: 3 }
      : {};

function BoxView({
  id,
  shape,
  selected,
  remoteColor,
}: ShapeViewProps & { shape: BoxShape }) {
  const fill = fillSwatch(shape.fill);
  return (
    <div
      data-shape-id={id}
      className="absolute rounded-md border-2 in-data-[tool=select]:cursor-move"
      style={{
        left: shape.x,
        top: shape.y,
        width: shape.w,
        height: shape.h,
        borderColor: swatch(shape.color).stroke,
        backgroundColor: fill?.fill ?? "transparent",
        ...outline(selected, remoteColor),
      }}
    >
      {selected && (
        <>
          <HandleDot
            handle="nw"
            className="-top-2 -left-2 cursor-nwse-resize"
          />
          <HandleDot
            handle="ne"
            className="-top-2 -right-2 cursor-nesw-resize"
          />
          <HandleDot
            handle="sw"
            className="-bottom-2 -left-2 cursor-nesw-resize"
          />
          <HandleDot
            handle="se"
            className="-right-2 -bottom-2 cursor-nwse-resize"
          />
        </>
      )}
    </div>
  );
}

const HEAD_LENGTH = 14;
const HEAD_SPREAD = 0.45;

/** The shaft from the tail at 0,0 to the head, and the two strokes of the arrowhead. */
function arrowPath({ dx, dy }: ArrowShape): string {
  const shaft = `M0 0L${dx} ${dy}`;
  if (dx === 0 && dy === 0) return shaft;
  const angle = Math.atan2(dy, dx);
  const wing = (side: number) =>
    `${dx - HEAD_LENGTH * Math.cos(angle + side * HEAD_SPREAD)} ${dy - HEAD_LENGTH * Math.sin(angle + side * HEAD_SPREAD)}`;
  return `${shaft}M${wing(-1)}L${dx} ${dy}L${wing(1)}`;
}

/**
 * An SVG with no size at the tail, drawing past its edges. Only the strokes take the pointer,
 * and a wide transparent one under the arrow makes it easy to grab.
 */
function ArrowView({
  id,
  shape,
  selected,
  remoteColor,
}: ShapeViewProps & { shape: ArrowShape }) {
  const path = arrowPath(shape);
  const highlight = selected ? "var(--primary)" : remoteColor;
  return (
    <>
      <svg
        data-shape-id={id}
        width={1}
        height={1}
        className="pointer-events-none absolute overflow-visible in-data-[tool=select]:cursor-move"
        style={{ left: shape.x, top: shape.y }}
      >
        {highlight && (
          <path
            d={path}
            fill="none"
            stroke={highlight}
            strokeOpacity={0.3}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={selected ? undefined : "6 6"}
          />
        )}
        <path
          d={`M0 0L${shape.dx} ${shape.dy}`}
          stroke="transparent"
          strokeWidth={16}
          strokeLinecap="round"
          style={{ pointerEvents: "stroke" }}
        />
        <path
          d={path}
          fill="none"
          stroke={swatch(shape.color).stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {selected && (
        <>
          <HandleDot
            handle="tail"
            className="-translate-1/2 cursor-move"
            style={{ left: shape.x, top: shape.y }}
          />
          <HandleDot
            handle="head"
            className="-translate-1/2 cursor-move"
            style={{ left: shape.x + shape.dx, top: shape.y + shape.dy }}
          />
        </>
      )}
    </>
  );
}

/** Text and its editor share these, so the text does not move when editing starts. */
const textClass =
  "absolute min-h-7 min-w-4 rounded-sm px-1 text-xl leading-7 font-medium whitespace-pre";

function TextView({
  id,
  shape,
  selected,
  remoteColor,
  editing,
  onTextChange,
  onTextDone,
}: ShapeViewProps & { shape: TextShape }) {
  const style: CSSProperties = {
    left: shape.x,
    top: shape.y,
    color: swatch(shape.color).stroke,
  };

  if (editing)
    return (
      <TextEditor
        initialText={shape.text}
        style={style}
        onChange={(text) => onTextChange(id, text)}
        onDone={() => onTextDone(id)}
      />
    );

  return (
    <div
      data-shape-id={id}
      className={cn(textClass, "in-data-[tool=select]:cursor-move")}
      style={{ ...style, ...outline(selected, remoteColor) }}
    >
      {shape.text}
    </div>
  );
}

interface TextEditorProps {
  initialText: string;
  style: CSSProperties;
  onChange: (text: string) => void;
  onDone: () => void;
}

/**
 * Edits a text in place. The element owns its content while it is open, which keeps the caret
 * and the browser's undo; each keystroke still goes to the store, so others watch the text
 * being typed. Escape, Ctrl+Enter or clicking elsewhere finishes.
 */
function TextEditor({ initialText, style, onChange, onDone }: TextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [text] = useState(initialText);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = text;
    el.focus();
    // Caret at the end, ready to keep typing.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [text]);

  return (
    <div
      ref={ref}
      data-editor
      role="textbox"
      aria-multiline
      aria-label="Text"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      className={cn(
        textClass,
        "cursor-text bg-background/80 outline-2 outline-offset-3 outline-primary select-text",
      )}
      style={style}
      onInput={(event) => onChange(event.currentTarget.innerText)}
      onBlur={onDone}
      onKeyDown={(event) => {
        // Shortcuts like Delete belong to the text while it is being edited.
        event.stopPropagation();
        if (
          event.key === "Escape" ||
          (event.key === "Enter" && (event.metaKey || event.ctrlKey))
        )
          event.currentTarget.blur();
      }}
    />
  );
}

function HandleDot({
  handle,
  className,
  style,
}: {
  handle: Handle;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <span
      data-handle={handle}
      className={cn(
        "absolute z-10 size-3 rounded-full border-2 border-primary bg-background",
        className,
      )}
      style={style}
    />
  );
}
