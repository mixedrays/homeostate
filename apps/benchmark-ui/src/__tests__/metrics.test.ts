import { describe, expect, it } from "vitest";
import type {
  OperationResult,
  ReplicaResult,
} from "@homeostate/benchmark-crdt/types";
import type { RenderResult } from "@homeostate/benchmark-store/types";
import {
  formatRatio,
  formatTick,
  formatTiming,
  formatValue,
  metricByKey,
  operationMetrics,
  renderMetrics,
  replicaMetrics,
} from "../lib/metrics";

const operation: OperationResult = {
  backend: "yjs",
  scenario: "toggle",
  size: 1000,
  write: { mean: 0.48, p50: 0.45, p99: 0.9, rme: 5, samples: 100 },
  roundtrip: { mean: 1.2, p50: 1.1, p99: 2, rme: 2, samples: 50 },
  rendersPerOp: 1,
  wastedPerOp: 0,
  wireBytesPerOp: 30,
  docBytesPerOp: -12,
  heapBytesPerOp: null,
};

const replica: ReplicaResult = {
  backend: "yjs",
  size: 1000,
  seed: { mean: 2.5, p50: 2.4, p99: 3, rme: 4, samples: 20 },
  adopt: { mean: 1.5, p50: 1.4, p99: 2, rme: 4, samples: 20 },
  docBytes: 80_000,
  heapBytes: null,
};

const renderResult: RenderResult = {
  adapter: "mobx",
  scenario: "toggle",
  size: 1000,
  rowRenders: 1000,
  listRenders: 1,
  searchBoxRenders: 0,
  footerRenders: 0,
  appRenders: 0,
  applyMs: 7.5,
  commitMs: 13.6,
  mountMs: 20.4,
};

describe("metrics", () => {
  it("reads the render counts, which have no spread behind them", () => {
    const rows = metricByKey(renderMetrics, "row-renders");
    expect(rows.unit).toBe("count");
    expect(rows.value(renderResult)).toBe(1000);
    expect(rows.spread).toBeUndefined();
    expect(metricByKey(renderMetrics, "apply").unit).toBe("duration");
  });

  it("carries the per-operation render counts on the backend metrics", () => {
    expect(metricByKey(operationMetrics, "renders").value(operation)).toBe(1);
    expect(metricByKey(operationMetrics, "wasted").value(operation)).toBe(0);
    expect(metricByKey(operationMetrics, "renders").unit).toBe("count");
  });

  it("formats counts as integers and leaves a missing one as a dash", () => {
    expect(formatValue("count", 1000)).toBe("1,000");
    expect(formatValue("count", 0)).toBe("0");
    expect(formatValue("count", null)).toBe("—");
    expect(formatTick("count", 250)).toBe("250");
    expect(formatTick("count", 2.5)).toBe("2.5");
  });

  it("reads operation figures and their spread", () => {
    const write = metricByKey(operationMetrics, "write");
    expect(write.value(operation)).toBe(0.48);
    const [low, high] = write.spread?.(operation) ?? [NaN, NaN];
    expect(low).toBeCloseTo(0.456);
    expect(high).toBeCloseTo(0.504);
    expect(metricByKey(operationMetrics, "write-p99").value(operation)).toBe(
      0.9,
    );
    expect(metricByKey(operationMetrics, "wire").value(operation)).toBe(30);
    expect(metricByKey(operationMetrics, "doc").signed).toBe(true);
    expect(metricByKey(operationMetrics, "heap").value(operation)).toBeNull();
  });

  it("reads replica figures", () => {
    expect(metricByKey(replicaMetrics, "seed").value(replica)).toBe(2.5);
    expect(metricByKey(replicaMetrics, "doc-size").value(replica)).toBe(80_000);
    expect(
      metricByKey(replicaMetrics, "heap-replica").value(replica),
    ).toBeNull();
  });

  it("falls back to the first metric for an unknown key", () => {
    expect(metricByKey(operationMetrics, "nope").key).toBe("write");
  });
});

describe("formatting", () => {
  it("formats values by unit", () => {
    expect(formatValue("duration", 0.48)).toBe("480 µs");
    expect(formatValue("bytes", 2048)).toBe("2.0 KB");
    expect(formatValue("bytes", -12, true)).toBe("-12 B");
    expect(formatValue("bytes", null)).toBe("—");
  });

  it("keeps axis ticks compact", () => {
    expect(formatTick("duration", 0)).toBe("0");
    expect(formatTick("duration", 1)).toBe("1 ms");
    expect(formatTick("duration", 0.001)).toBe("1 µs");
    expect(formatTick("bytes", 1024)).toBe("1 KB");
    expect(formatTick("bytes", 10240)).toBe("10 KB");
    expect(formatTick("bytes", 100)).toBe("100 B");
  });

  it("formats timings and ratios like the CLI", () => {
    expect(formatTiming(operation.write)).toBe("480 µs ±5.0%");
    expect(formatRatio(1, 1)).toBe("1.0×");
    expect(formatRatio(48, 1)).toBe("48×");
    expect(formatRatio(542796, 1)).toBe("542,796×");
    expect(formatRatio(1, 0)).toBe("—");
  });
});
