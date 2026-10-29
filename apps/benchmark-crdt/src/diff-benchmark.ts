import { deepStrictEqual } from "node:assert";
import { Bench } from "tinybench";
import {
  ChangeType,
  getChanges,
  type DiffOptions,
  type JsonObject,
  type RecordChange,
} from "@homeostate/core";
import { formatDuration, table } from "./report.js";
import { makeTodos } from "./scenarios.js";

interface Fixture {
  name: string;
  before: JsonObject;
  after: JsonObject;
  expected: RecordChange[];
}

const { UPDATE, PENDING } = ChangeType;

/** Build every input before timing, keeping the identity of unchanged todos. */
const fixtures = (size: number): Fixture[] => {
  const todos = makeTodos(size);
  const index = Math.floor(size / 2);
  const changed = { ...todos[index], completed: true };
  const entities = Object.fromEntries(todos.map((todo) => [todo.id, todo]));

  return [
    {
      name: "unchanged record",
      before: { entities, count: 0 },
      after: { entities, count: 1 },
      expected: [{ type: UPDATE, key: "count", value: 1 }],
    },
    {
      name: "normalized toggle",
      before: { entities },
      after: { entities: { ...entities, [changed.id]: changed } },
      expected: [
        {
          type: PENDING,
          key: "entities",
          kind: "record",
          changes: [
            {
              type: PENDING,
              key: changed.id,
              kind: "record",
              changes: [{ type: UPDATE, key: "completed", value: true }],
            },
          ],
        },
      ],
    },
    {
      name: "unchanged array",
      before: { todos, count: 0 },
      after: { todos, count: 1 },
      expected: [{ type: UPDATE, key: "count", value: 1 }],
    },
    {
      name: "array toggle",
      before: { todos },
      after: { todos: todos.map((todo, i) => (i === index ? changed : todo)) },
      expected: [
        {
          type: PENDING,
          key: "todos",
          kind: "list",
          changes: [
            {
              type: PENDING,
              key: index,
              kind: "record",
              changes: [{ type: UPDATE, key: "completed", value: true }],
            },
          ],
        },
      ],
    },
    {
      name: "unshared equal array",
      before: { todos },
      after: { todos: todos.map((todo) => ({ ...todo })) },
      expected: [],
    },
  ];
};

const main = async (): Promise<void> => {
  process.stdout.write(
    `Core diff benchmark · ${new Date().toISOString()} · node ${process.version}\n` +
      "250 ms per task, at least 10 samples; inputs built before timing\n\n",
  );

  const rows: string[][] = [];
  for (const size of [100, 1000, 10_000]) {
    for (const json of [false, true]) {
      const options: DiffOptions = { json, text: () => false };
      const inputs = fixtures(size);
      const bench = new Bench({ time: 250, iterations: 10, throws: true });
      for (const { name, before, after, expected } of inputs) {
        deepStrictEqual(getChanges(before, after, options), expected, name);
        bench.add(name, () => {
          getChanges(before, after, options);
        });
      }

      for (const task of await bench.run()) {
        const result = task.result;
        if (result.state === "errored") throw result.error;
        if (!("latency" in result))
          throw new Error(`Benchmark "${task.name}" ended in ${result.state}`);
        const { latency } = result;
        rows.push([
          String(size),
          String(json),
          task.name,
          `${formatDuration(latency.mean)} ±${latency.rme.toFixed(1)}%`,
          formatDuration(latency.p99),
          String(task.runs),
        ]);
      }
    }
  }

  process.stdout.write(
    table(["rows", "json", "workload", "mean", "p99", "samples"], rows) + "\n",
  );
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
