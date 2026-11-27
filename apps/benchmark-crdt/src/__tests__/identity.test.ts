import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { createSyncEngine, type SyncEngine } from "@homeostate/core";
import { yjs } from "../candidates.js";
import { countRenders, deepEqual } from "../renders.js";
import {
  add,
  emptyState,
  keystroke,
  makeState,
  move,
  paste,
  remove,
  search,
  toggle,
} from "../scenarios.js";
import { createStore, type BenchStore } from "../store.js";
import type { Scenario, TodoState } from "../types.js";

/**
 * Gates core's structural sharing over Yjs: how many of a thousand rows the receiving store gets
 * back as new objects after one operation. With `keepIdentity` as `structuredClone(next)`, core's
 * small unit test still passes but these counts reach 1000. Every backend reports the same.
 */

const SIZE = 1000;

interface Peer {
  store: BenchStore<TodoState>;
  engine: SyncEngine;
}

interface Pair {
  a: Peer;
  b: Peer;
  doc: Y.Doc;
  destroy(): void;
}

/** Peer `a` holds `SIZE` todos, peer `b` starts empty and adopts them over the wire. */
const createPair = (): Pair => {
  const replicaA = yjs.createReplica();
  const replicaB = yjs.createReplica();
  const wire = yjs.connect(replicaA, replicaB);

  const peer = (replica: typeof replicaA, state: TodoState): Peer => {
    const store = createStore(state);
    const engine = createSyncEngine({
      backend: replica.backend,
      adapter: store.adapter,
    });
    engine.connect();
    return { store, engine };
  };

  const a = peer(replicaA, makeState(SIZE));
  const b = peer(replicaB, emptyState());

  return {
    a,
    b,
    doc: replicaA.doc,
    destroy: () => {
      a.engine.disconnect();
      b.engine.disconnect();
      wire.disconnect();
      replicaA.destroy?.();
      replicaB.destroy?.();
    },
  };
};

/** One scenario step on `a`, and what the rows of `b` cost between the two states. */
const applyOne = (
  scenario: Scenario,
): { before: TodoState; after: TodoState } => {
  const pair = createPair();
  const before = pair.b.store.getState();
  expect(before.todos).toHaveLength(SIZE);

  pair.a.store.setState(scenario.step(pair.a.store.getState(), 0));

  const after = pair.b.store.getState();
  // Key order differs between backends, so the check has to be structural, not stringified.
  expect(deepEqual(after, pair.a.store.getState())).toBe(true);
  pair.destroy();

  return { before, after };
};

interface Expectation {
  scenario: Scenario;
  /** Surviving rows handed to the store as a new object, matched by `id`. */
  renders: number;
  /** Of those, the rows whose data is deep-equal. */
  wasted: number;
  /** Whether `state.todos` itself came back as a new array. */
  todosReplaced: boolean;
}

const expectations: Expectation[] = [
  { scenario: toggle, renders: 1, wasted: 0, todosReplaced: true },
  { scenario: keystroke, renders: 1, wasted: 0, todosReplaced: true },
  { scenario: paste, renders: 1, wasted: 0, todosReplaced: true },
  // A top-level string leaves the array alone entirely: a list memoized on `todos` does not
  // even re-render its container.
  { scenario: search, renders: 0, wasted: 0, todosReplaced: false },
  // Insert and delete move the surviving references rather than rebuilding them, so a keyed
  // list re-renders nothing. Matched by index this would report ~N/2 changed rows.
  { scenario: add, renders: 0, wasted: 0, todosReplaced: true },
  { scenario: remove, renders: 0, wasted: 0, todosReplaced: true },
  // `getArrayChanges` pairs a delete with an insert by position, so the moved row is rebuilt
  // with identical data: the one wasted render.
  { scenario: move, renders: 1, wasted: 1, todosReplaced: true },
];

describe(`identity of ${SIZE} todos across a Yjs roundtrip`, () => {
  it.each(expectations)(
    "$scenario.name re-renders $renders rows, $wasted of them wasted",
    ({ scenario, renders, wasted, todosReplaced }) => {
      const { before, after } = applyOne(scenario);

      expect(countRenders(before, after)).toEqual({ renders, wasted });
      expect(after.todos !== before.todos).toBe(todosReplaced);
    },
  );

  it("keeps the top-level keys the operation did not touch", () => {
    const { before, after } = applyOne(toggle);

    expect(after.searchTerm).toBe(before.searchTerm);
    expect(after.filterStatus).toBe(before.filterStatus);
  });

  it("does not notify the store for a remote change that changes nothing", () => {
    const pair = createPair();
    const before = pair.b.store.getState();
    let notifications = 0;
    const unsubscribe = pair.b.store.adapter.subscribe(() => notifications++);

    // A Y.Map.set always produces an update, even for an equal value, so peer `b` hears it;
    // the engine's `mergeStates` keeps it from the store.
    pair.doc.transact(() =>
      pair.doc.getMap<unknown>("shared").set("searchTerm", new Y.Text("")),
    );

    expect(notifications).toBe(0);
    expect(pair.b.store.getState()).toBe(before);

    unsubscribe();
    pair.destroy();
  });
});
