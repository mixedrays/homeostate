import type { KeyStatus } from "../inspector";
import type { Json } from "../json";
import type { NetworkSnapshot } from "../network";

const MAX_STRING = 80;

export const previewOf = (value: Json | undefined): string => {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value !== null && typeof value === "object") {
    const count = Object.keys(value).length;
    return `{…} ${count} ${count === 1 ? "key" : "keys"}`;
  }
  const text = JSON.stringify(value);
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING - 1)}…"` : text;
};

/** `None`, `100 ms`, `2 s`. */
export const formatDelay = (ms: number): string => {
  if (ms === 0) return "None";
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
};

/** Whether any condition slows down or cuts the link. */
export const conditionsActive = ({ conditions }: NetworkSnapshot): boolean =>
  conditions.latency > 0 ||
  conditions.jitter > 0 ||
  conditions.offline ||
  conditions.flaky;

/** `512 B`, `4.2 KB`, `1.3 MB`. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const keyStatusInfo: Record<
  KeyStatus,
  { label: string; hint: string; className: string }
> = {
  synced: {
    label: "synced",
    hint: "The backend holds the same value.",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  diverged: {
    label: "diverged",
    hint: "The backend holds another value. Expected while disconnected: reconnecting adopts the backend's value.",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  pending: {
    label: "pending",
    hint: "Synced by the filter, but not in the backend yet. It is written on the next local change.",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  local: {
    label: "local",
    hint: "The sync filter keeps this key out of the backend.",
    className: "bg-muted text-muted-foreground",
  },
  "backend-only": {
    label: "backend only",
    hint: "The backend holds this key but the store does not.",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
};
