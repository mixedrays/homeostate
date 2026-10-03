import { toJsonValue } from "@homeostate/core";
import type { LogEntry, LogOrigin } from "./inspector";
import { isRecord, type DiffKind, type JsonObject } from "./json";

const FORMAT = "homeostate-devtools-log";
const VERSION = 1;

const ORIGINS: readonly LogOrigin[] = [
  "initial",
  "local",
  "remote",
  "devtools",
];
const KINDS: readonly DiffKind[] = ["insert", "update", "delete"];

/** A log as the Log tab exports it. */
export interface LogFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  /** The name of the source the log was recorded from. */
  source: string;
  /** Epoch milliseconds. */
  exportedAt: number;
  /** Oldest first. */
  entries: LogEntry[];
}

/** `log` as a JSON file that `parseLog` reads back. */
export const serializeLog = (
  source: string,
  log: readonly LogEntry[],
  exportedAt = Date.now(),
): string => {
  const file: LogFile = {
    format: FORMAT,
    version: VERSION,
    source,
    exportedAt,
    entries: log.map((entry) => {
      const recorded = { ...entry };
      delete recorded.imported;
      return recorded;
    }),
  };
  return JSON.stringify(file, null, 2);
};

const isPath = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (key) =>
      typeof key === "string" || (Number.isInteger(key) && Number(key) >= 0),
  );

const entryProblem = (entry: unknown, ids: Set<number>): string | null => {
  if (!isRecord(entry)) return "is not an object";
  const { id, at, origin, label, state, diff } = entry;
  if (!Number.isSafeInteger(id) || (id as number) < 0) return "has no valid id";
  if (ids.has(id as number)) return `repeats id ${String(id)}`;
  ids.add(id as number);
  if (typeof at !== "number") return "has no valid time";
  if (!ORIGINS.includes(origin as LogOrigin)) return "has no valid origin";
  if (label !== undefined && typeof label !== "string")
    return "has a label that is not a string";
  if (!isRecord(state)) return "has a state that is not an object";
  if (
    !Array.isArray(diff) ||
    !diff.every(
      (line) =>
        isRecord(line) &&
        KINDS.includes(line.kind as DiffKind) &&
        isPath(line.path),
    )
  )
    return "has no valid diff";
  return null;
};

/**
 * The source name and entries of a file `serializeLog` wrote. Throws an error that says what
 * is wrong with any other file. States are read without `__proto__` keys, which the engine
 * never syncs and which would replace the prototype of the store's state on restore.
 */
export const parseLog = (
  text: string,
): { source: string; entries: LogEntry[] } => {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("The file is not JSON.");
  }
  if (!isRecord(file) || file.format !== FORMAT)
    throw new Error("The file is not a Homeostate devtools log.");
  if (file.version !== VERSION)
    throw new Error(
      `The log has version ${JSON.stringify(file.version)}; this panel reads version ${VERSION}.`,
    );
  if (!Array.isArray(file.entries))
    throw new Error("The log has no list of entries.");

  const ids = new Set<number>();
  const entries = file.entries.map((entry: unknown, index): LogEntry => {
    const problem = entryProblem(entry, ids);
    if (problem) throw new Error(`Entry ${index + 1} ${problem}.`);
    const valid = entry as unknown as LogEntry;
    return { ...valid, state: toJsonValue(valid.state) as JsonObject };
  });
  return {
    source: typeof file.source === "string" ? file.source : "",
    entries,
  };
};
