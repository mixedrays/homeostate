import {
  Fragment,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";
import { readSelection, type Selection } from "../presence";

export interface RemoteCursor extends Selection {
  id: number;
  name: string;
  color: string;
}

interface CollaborativeTextareaProps {
  value: string;
  /** Other writers' selections, as offsets into `value`. */
  cursors: readonly RemoteCursor[];
  label: string;
  onChange: (value: string) => void;
  /** This tab's selection moved, or null once the textarea loses focus. */
  onSelectionChange: (selection: Selection | null) => void;
  /**
   * Where this tab's selection belongs after `value` changed under it. Null leaves the caret
   * wherever the browser puts it, which is the end of the text.
   */
  mapSelection: () => Selection | null;
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * Classes the textarea and its overlay share. The overlay draws the other cursors by laying
 * out the same text the same way, so anything that moves a line break (font, padding, border,
 * wrapping) has to be identical on both.
 */
const surface =
  "col-start-1 row-start-1 min-h-80 w-full rounded-lg border px-4 py-5 font-sans text-base leading-7 whitespace-pre-wrap [overflow-wrap:break-word] [tab-size:4]";

/**
 * A plain textarea with the other writers' carets and selections drawn over it.
 *
 * Both sit in one grid cell. The overlay holds the text in transparent ink, so it takes the
 * height the text needs and the textarea stretches to match, never scrolling on its own; the
 * two then stay aligned without measuring anything.
 */
export function CollaborativeTextarea({
  value,
  cursors,
  label,
  onChange,
  onSelectionChange,
  mapSelection,
  ref: forwardedRef,
}: CollaborativeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!, []);

  // The textarea owns its value while this tab types, which keeps the browser's caret and undo
  // intact. Text from another tab is written in here instead, and the caret is put back on the
  // character it was on rather than jumping to the end.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.value === value) return;

    const selection = document.activeElement === el ? mapSelection() : null;
    el.value = value;
    if (selection) {
      el.setSelectionRange(
        Math.min(selection.anchor, selection.head),
        Math.max(selection.anchor, selection.head),
        selection.anchor > selection.head ? "backward" : "forward",
      );
    }
  }, [value, mapSelection]);

  return (
    <div className="grid">
      <textarea
        ref={ref}
        defaultValue={value}
        aria-label={label}
        placeholder="Start typing…"
        onChange={(event) => onChange(event.currentTarget.value)}
        onSelect={(event) =>
          onSelectionChange(readSelection(event.currentTarget))
        }
        onFocus={(event) =>
          onSelectionChange(readSelection(event.currentTarget))
        }
        onBlur={() => onSelectionChange(null)}
        className={cn(
          surface,
          "resize-none overflow-hidden border-input bg-transparent transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      />
      <div
        aria-hidden
        className={cn(
          surface,
          "pointer-events-none border-transparent text-transparent select-none",
        )}
      >
        <CursorLayer text={value} cursors={cursors} />
        {/* A trailing newline only takes up a line once something follows it. */}{" "}
      </div>
    </div>
  );
}

/**
 * The text cut at every cursor and selection edge: carets go in at the cuts, and each piece is
 * tinted by every selection that covers it, so overlapping selections blend.
 */
function CursorLayer({
  text,
  cursors,
}: {
  text: string;
  cursors: readonly RemoteCursor[];
}) {
  const clamp = (index: number) => Math.min(Math.max(index, 0), text.length);
  const placed = cursors.map((cursor) => ({
    ...cursor,
    head: clamp(cursor.head),
    from: clamp(Math.min(cursor.anchor, cursor.head)),
    to: clamp(Math.max(cursor.anchor, cursor.head)),
  }));
  const cuts = [
    ...new Set([0, text.length, ...placed.flatMap((c) => [c.from, c.to])]),
  ].sort((a, b) => a - b);

  return cuts.map((cut, i) => {
    const next = cuts[i + 1];
    return (
      <Fragment key={cut}>
        {placed
          .filter((cursor) => cursor.head === cut)
          .map((cursor) => (
            <Caret key={cursor.id} name={cursor.name} color={cursor.color} />
          ))}
        {next !== undefined &&
          placed
            .filter((cursor) => cursor.from <= cut && next <= cursor.to)
            .reduce<ReactNode>(
              (piece, cursor) => (
                <span
                  data-selection={cursor.id}
                  style={{
                    backgroundColor: `color-mix(in srgb, ${cursor.color} 22%, transparent)`,
                  }}
                >
                  {piece}
                </span>
              ),
              text.slice(cut, next),
            )}
      </Fragment>
    );
  });
}

/**
 * An empty inline box whose left border is the caret. The negative margin takes the border's
 * width back, so the caret adds no width and cannot move a line break.
 */
function Caret({ name, color }: { name: string; color: string }) {
  return (
    <span
      data-caret
      className="relative -mr-0.5 border-l-2"
      style={{ borderColor: color }}
    >
      <span
        className="absolute bottom-full -left-0.5 rounded-sm rounded-bl-none px-1 text-[11px] leading-4 font-medium whitespace-nowrap text-white"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </span>
  );
}
