import { describe, expect, it } from "vitest";
import type {
  BenchmarkReport,
  OperationResult,
  Timing,
} from "@homeostate/benchmark-crdt/types";
import { metricByKey, operationMetrics } from "../lib/metrics";
import { operationAt, type Run } from "../lib/runs";
import {
  backendsAcross,
  chronological,
  deltaAt,
  describeChange,
  read,
  rebase,
  relativeTo,
  scenariosAcross,
  sizesAcross,
  stepsOf,
  tickLabel,
  writtenAt,
} from "../lib/trend";

const timing = (mean: number): Timing => ({
  mean,
  p50: mean,
  p99: mean * 2,
  rme: 1,
  samples: 10,
});

const operation = (
  backend: string,
  scenario: string,
  size: number,
  write: number,
  wire = 30,
): OperationResult => ({
  backend,
  scenario,
  size,
  write: timing(write),
  roundtrip: timing(write * 3),
  rendersPerOp: 1,
  wastedPerOp: 0,
  wireBytesPerOp: wire,
  docBytesPerOp: 12,
  heapBytesPerOp: null,
});

const run = (
  id: string,
  meta: { date: string; commitDate?: string; commit?: string | null },
  operations: OperationResult[],
): Run => ({
  kind: "backend",
  id,
  name: `${id}.json`,
  source: "file",
  report: {
    meta: {
      date: meta.date,
      ...(meta.commitDate === undefined ? {} : { commitDate: meta.commitDate }),
      node: "v22.0.0",
      commit: meta.commit === undefined ? id : meta.commit,
      dirty: false,
      versions: {},
      options: { time: 250, minSamples: 10, operations: 20, sizes: [100] },
    },
    replicas: [],
    operations,
  } satisfies BenchmarkReport,
});

describe("ordering", () => {
  // `late` benchmarks an old commit today; `legacy` predates the commit date field.
  const early = run(
    "early",
    { date: "2026-10-01T00:00:00Z", commitDate: "2026-09-01T00:00:00Z" },
    [],
  );
  const late = run(
    "late",
    { date: "2026-10-12T00:00:00Z", commitDate: "2026-08-01T00:00:00Z" },
    [],
  );
  const legacy = run("legacy", { date: "2026-09-15T00:00:00Z" }, []);

  it("orders runs by when the measured commit was made", () => {
    expect(writtenAt(late.report.meta)).toBe("2026-08-01T00:00:00Z");
    expect(writtenAt(legacy.report.meta)).toBe("2026-09-15T00:00:00Z");
    expect(chronological([early, legacy, late]).map((r) => r.id)).toEqual([
      "late",
      "early",
      "legacy",
    ]);
  });

  it("keeps two runs of one commit in the order they were made", () => {
    const again = run(
      "again",
      { date: "2026-09-30T00:00:00Z", commitDate: "2026-09-01T00:00:00Z" },
      [],
    );
    expect(chronological([early, again]).map((r) => r.id)).toEqual([
      "again",
      "early",
    ]);
  });

  it("labels a tick by commit, or by date without one", () => {
    expect(tickLabel(early)).toBe("early");
    expect(
      tickLabel(run("x", { date: "2026-10-01T09:00:00Z", commit: null }, [])),
    ).toBe("2026-10-01");
  });
});

describe("a set of runs", () => {
  const a = run("a", { date: "2026-10-01T00:00:00Z" }, [
    operation("yjs", "toggle", 1000, 1),
    operation("yjs", "add", 100, 1),
  ]);
  const b = run("b", { date: "2026-10-02T00:00:00Z" }, [
    operation("loro", "toggle", 100, 1),
    operation("yjs", "toggle", 1000, 2),
  ]);

  it("unites the matrix of every run", () => {
    expect(sizesAcross([a, b])).toEqual([100, 1000]);
    expect(backendsAcross([a, b])).toEqual(["yjs", "loro"]);
    expect(scenariosAcross([a, b])).toEqual(["toggle", "add"]);
  });

  it("reads a metric, or nothing for a row the run lacks", () => {
    const write = metricByKey(operationMetrics, "write");
    expect(read(write, operationAt(a.report, 1000, "toggle", "yjs"))).toEqual({
      value: 1,
      spread: [0.99, 1.01],
    });
    expect(read(write, operationAt(a.report, 100, "toggle", "loro"))).toEqual({
      value: null,
      spread: null,
    });
  });
});

describe("relative change", () => {
  it("is a ratio of the base, with no answer for a zero base", () => {
    expect(relativeTo(2, 3)).toBe(0.5);
    expect(relativeTo(-2, -1)).toBe(0.5);
    expect(relativeTo(0, 3)).toBeNull();
    expect(relativeTo(null, 3)).toBeNull();
    expect(relativeTo(2, null)).toBeNull();
  });

  it("rebases a series on its first value, spread included", () => {
    expect(
      rebase([
        { value: null, spread: null },
        { value: 2, spread: [1.5, 2.5] },
        { value: 3, spread: null },
      ]),
    ).toEqual([
      { value: null, spread: null },
      { value: 0, spread: [-0.25, 0.25] },
      { value: 0.5, spread: null },
    ]);
    expect(
      rebase([
        { value: 0, spread: null },
        { value: 4, spread: null },
      ]),
    ).toEqual([
      { value: null, spread: null },
      { value: null, spread: null },
    ]);
  });
});

describe("steps", () => {
  const runs = [
    run("one", { date: "2026-10-01T00:00:00Z" }, [
      operation("yjs", "toggle", 100, 1, 30),
      operation("yjs", "add", 100, 1),
    ]),
    run("two", { date: "2026-10-02T00:00:00Z" }, [
      operation("yjs", "toggle", 100, 1.5, 30),
      operation("yjs", "add", 100, 3),
    ]),
    run("three", { date: "2026-10-03T00:00:00Z" }, [
      operation("yjs", "toggle", 100, 1.5, 300),
      operation("yjs", "add", 100, 1.5),
    ]),
  ];

  it("compares each run with the one before it", () => {
    const steps = stepsOf(runs, 0.05);
    expect(steps.map((s) => `${s.from.id}→${s.to.id}`)).toEqual([
      "one→two",
      "two→three",
    ]);
    expect(stepsOf(runs.slice(0, 1), 0.05)).toEqual([]);
  });

  it("ranks significant changes, largest first", () => {
    const [first, second] = stepsOf(runs, 0.05);
    // write and roundtrip of both scenarios grow; wire bytes do not move.
    expect(first.regressions.map(describeChange)).toEqual([
      "write · add · yjs · 100 todos",
      "roundtrip · add · yjs · 100 todos",
      "write · toggle · yjs · 100 todos",
      "roundtrip · toggle · yjs · 100 todos",
    ]);
    expect(first.improvements).toEqual([]);
    expect(describeChange(second.regressions[0])).toBe(
      "wire / op · toggle · yjs · 100 todos",
    );
    expect(second.improvements.map((c) => c.delta.metric)).toEqual([
      "write",
      "roundtrip",
    ]);
  });

  it("finds one metric of one row", () => {
    const [first] = stepsOf(runs, 0.05);
    expect(deltaAt(first.comparison, 100, "add", "yjs", "write")?.change).toBe(
      2,
    );
    expect(
      deltaAt(first.comparison, 100, "add", "yjs", "write p99"),
    ).toBeUndefined();
    expect(deltaAt(first.comparison, 100, null, "yjs", "seed")).toBeUndefined();
  });
});
