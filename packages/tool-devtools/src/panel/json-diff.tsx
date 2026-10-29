import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import { formatPath, type DiffLine, type Json } from "../json";
import { CopyButton } from "./copy-button";
import { previewOf } from "./format";
import { JsonValue } from "./value";

const DIFF_LIMIT = 10;

/** Read-only differences, with full values, copy actions and expandable results. */
export function JsonDiff({
  lines,
  label,
  beforeLabel = "before",
  afterLabel = "after",
  beforeFirst = true,
}: {
  lines: readonly DiffLine[];
  label: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeFirst?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowsId = useId();
  const order = beforeFirst
    ? (["before", "after"] as const)
    : (["after", "before"] as const);
  const shown = expanded ? lines : lines.slice(0, DIFF_LIMIT);
  // Array edits can touch the same path more than once. Distinguish those occurrences
  // while preserving inspected paths when earlier differences are added or removed.
  const occurrences = new Map<string, number>();

  return (
    <table
      aria-label={label}
      className="mt-1 mb-1.5 w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-0.5 font-mono"
    >
      <thead className="text-[10px] text-muted-foreground">
        <tr>
          <th scope="col">
            <span className="sr-only">Path</span>
          </th>
          {order.map((side) => (
            <th key={side} scope="col" className="text-left font-normal">
              {side === "before" ? beforeLabel : afterLabel}
            </th>
          ))}
        </tr>
      </thead>
      <tbody id={rowsId} className="align-baseline">
        {shown.map((line) => {
          const path = formatPath(line.path);
          const identity = JSON.stringify([line.path, line.kind]);
          const occurrence = occurrences.get(identity) ?? 0;
          occurrences.set(identity, occurrence + 1);
          return (
            <tr key={`${identity}:${occurrence}`}>
              <th
                scope="row"
                className="text-left font-normal text-sky-700 dark:text-sky-400"
              >
                <div className="flex items-start gap-0.5">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {path}
                  </span>
                  <CopyButton
                    iconOnly
                    text={path}
                    label={`Copy path ${path}`}
                  />
                </div>
              </th>
              {order.map((side) => (
                <td key={side}>
                  <Side
                    label={`${side === "before" ? beforeLabel : afterLabel} value at ${path}`}
                    value={line[side]}
                    present={
                      line.kind !== (side === "before" ? "insert" : "delete")
                    }
                  />
                </td>
              ))}
            </tr>
          );
        })}
        {lines.length > DIFF_LIMIT && (
          <tr>
            <td colSpan={3} className="text-muted-foreground">
              <Button
                size="xs"
                variant="link"
                aria-expanded={expanded}
                aria-controls={rowsId}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded
                  ? `Show first ${DIFF_LIMIT} differences`
                  : `Show all ${lines.length} differences`}
              </Button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Side({
  value,
  present,
  label,
}: {
  value: Json | undefined;
  present: boolean;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  if (!present || value === undefined)
    return <span className="text-muted-foreground">not set</span>;

  const text = JSON.stringify(value, null, 2);
  const expandable = previewOf(value) !== JSON.stringify(value);

  return (
    <div className="min-w-0">
      <div className="flex items-start gap-0.5">
        {expandable ? (
          <button
            type="button"
            aria-label={`Inspect ${label}`}
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            title={expanded ? "Hide full value" : "Show full value"}
            onClick={() => setExpanded(!expanded)}
            className="flex min-w-0 flex-1 items-start gap-0.5 rounded py-0.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "mt-0.5 size-3 shrink-0 transition-transform",
                expanded && "rotate-90",
              )}
            />
            <JsonValue value={value} />
          </button>
        ) : (
          <JsonValue value={value} className="min-w-0 flex-1 py-0.5" />
        )}
        <CopyButton iconOnly text={text} label={`Copy ${label}`} />
      </div>
      {expandable && expanded && (
        <pre
          id={detailsId}
          role="region"
          aria-label={`Full ${label}`}
          tabIndex={0}
          className="mt-1 max-h-64 overflow-auto rounded border bg-muted/40 p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}
