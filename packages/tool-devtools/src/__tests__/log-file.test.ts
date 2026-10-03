import { describe, expect, it } from "vitest";
import type { LogEntry } from "../inspector";
import { parseLog, serializeLog } from "../log-file";

const entries: LogEntry[] = [
  { id: 0, at: 1000, origin: "initial", state: { count: 0 }, diff: [] },
  {
    id: 1,
    at: 2000,
    origin: "remote",
    label: "Edited count",
    state: { count: 1 },
    diff: [{ kind: "update", path: ["count"], before: 0, after: 1 }],
    imported: true,
  },
];

const fileWith = (fields: Record<string, unknown>): string =>
  JSON.stringify({
    format: "homeostate-devtools-log",
    version: 1,
    source: "Counter",
    exportedAt: 0,
    entries: [],
    ...fields,
  });

describe("log files", () => {
  it("read back what they wrote, without the imported mark", () => {
    const text = serializeLog("Counter", entries, 5000);
    expect(JSON.parse(text)).toMatchObject({
      format: "homeostate-devtools-log",
      version: 1,
      source: "Counter",
      exportedAt: 5000,
    });

    const recorded = { ...entries[1] };
    delete recorded.imported;
    expect(parseLog(text)).toEqual({
      source: "Counter",
      entries: [entries[0], recorded],
    });
  });

  it("say what is wrong with a file they cannot read", () => {
    expect(() => parseLog("{")).toThrow("The file is not JSON.");
    expect(() => parseLog("{}")).toThrow(
      "The file is not a Homeostate devtools log.",
    );
    expect(() => parseLog(fileWith({ version: 2 }))).toThrow(
      "The log has version 2; this panel reads version 1.",
    );
    expect(() =>
      parseLog(
        fileWith({
          entries: [entries[0], { ...entries[0], id: 1, state: [] }],
        }),
      ),
    ).toThrow("Entry 2 has a state that is not an object.");
    expect(() =>
      parseLog(fileWith({ entries: [entries[0], entries[0]] })),
    ).toThrow("Entry 2 repeats id 0.");
    expect(() =>
      parseLog(
        fileWith({
          entries: [{ ...entries[0], diff: [{ kind: "move", path: [] }] }],
        }),
      ),
    ).toThrow("Entry 1 has no valid diff.");
  });

  it("drop __proto__ keys from states, so a restore cannot set a prototype", () => {
    const text = fileWith({
      entries: [
        {
          ...entries[0],
          state: JSON.parse(
            '{"count":1,"user":{"__proto__":{"isAdmin":true}}}',
          ),
        },
      ],
    });
    const [entry] = parseLog(text).entries;
    expect(entry.state).toEqual({ count: 1, user: {} });
    expect(Object.keys(entry.state.user as object)).toEqual([]);
  });
});
