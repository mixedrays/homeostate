import { cn } from "cn";
import { Badge } from "../components/ui/badge";
import type { KeyStatus, LogOrigin } from "../inspector";
import type { Json } from "../json";
import { keyStatusInfo, previewOf } from "./format";

const valueColor = (value: Json | undefined): string => {
  if (typeof value === "string")
    return "text-emerald-700 dark:text-emerald-400";
  if (typeof value === "number") return "text-amber-700 dark:text-amber-400";
  if (typeof value === "boolean") return "text-violet-700 dark:text-violet-400";
  if (value === null) return "text-rose-700 dark:text-rose-400";
  return "text-muted-foreground";
};

/** A value on one line: primitives in full up to a length, containers as a summary. */
export function JsonValue({
  value,
  className,
}: {
  value: Json | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono [overflow-wrap:anywhere]",
        valueColor(value),
        className,
      )}
    >
      {previewOf(value)}
    </span>
  );
}

export function KeyStatusBadge({ status }: { status: KeyStatus }) {
  const info = keyStatusInfo[status];
  return (
    <Badge
      title={info.hint}
      className={cn("h-4 px-1.5 text-[10px]", info.className)}
    >
      {info.label}
    </Badge>
  );
}

/** Marks a value that is not JSON with what it really is, such as `Date`. */
export function NonJsonBadge({ kind }: { kind: string }) {
  return (
    <Badge
      title={`Not JSON (${kind}): shown here as JSON would show it, and not synced as it is.`}
      className="h-4 shrink-0 bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-400"
    >
      {kind}
    </Badge>
  );
}

const originInfo: Record<LogOrigin, { label: string; className: string }> = {
  initial: { label: "initial", className: "bg-muted text-muted-foreground" },
  local: {
    label: "local",
    className: "bg-secondary text-secondary-foreground",
  },
  remote: {
    label: "remote",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  devtools: {
    label: "devtools",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  },
};

export function OriginBadge({ origin }: { origin: LogOrigin }) {
  const info = originInfo[origin];
  return (
    <Badge className={cn("h-4 px-1.5 text-[10px]", info.className)}>
      {info.label}
    </Badge>
  );
}
