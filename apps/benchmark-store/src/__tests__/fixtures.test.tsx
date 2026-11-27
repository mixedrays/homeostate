// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import {
  add,
  createStore,
  keystroke,
  move,
  remove,
  search,
  toggle,
} from "@homeostate/benchmark-crdt";
import type { Scenario } from "@homeostate/benchmark-crdt";
import { createCounters } from "../counters.js";
import { enableActEnvironment } from "../dom.js";
import { measure } from "../driver.js";
import { fixtures, mobx, mobxStateTree, redux } from "../fixtures/index.js";
import type { Fixture } from "../types.js";

/**
 * Gates the fixtures as much as the adapters: a fixture memoized at the wrong level scores
 * anything, so each count here was measured independently. Counts are exact; timings are not
 * asserted.
 */

const SIZE = 200;

beforeAll(enableActEnvironment);

/** Row renders per adapter for one remote change, keyed by fixture name. */
type Rows = Record<string, number>;

interface Expectation {
  scenario: Scenario;
  rows: Rows;
}

/**
 * `redux` and `zustand` re-render what core changed. `mobx` applies core's edit script in place
 * and `mobx-state-tree` reconciles nodes by identifier, so they match, except MST on `move`,
 * whose arrays reconcile by position.
 */
const expectations: Expectation[] = [
  {
    scenario: toggle,
    rows: { redux: 1, zustand: 1, "mobx-state-tree": 1, mobx: 1 },
  },
  {
    scenario: keystroke,
    rows: { redux: 1, zustand: 1, "mobx-state-tree": 1, mobx: 1 },
  },
  // The added row has to mount whatever the adapter does.
  {
    scenario: add,
    rows: { redux: 1, zustand: 1, "mobx-state-tree": 1, mobx: 1 },
  },
  // Deleting a row costs nothing: the survivors keep their references.
  {
    scenario: remove,
    rows: { redux: 0, zustand: 0, "mobx-state-tree": 0, mobx: 0 },
  },
  // Core rebuilds the moved row and nothing else, which is its one wasted render: the edit
  // script pairs the delete with an insert, and the inserted todo is a fresh node. MST rebuilds
  // the whole list because it pairs snapshot to node by index rather than by identifier.
  {
    scenario: move,
    rows: { redux: 1, zustand: 1, "mobx-state-tree": SIZE, mobx: 1 },
  },
  // A top-level string that no row reads. Both fine-grained adapters skip the list entirely:
  // the incoming `todos` is the same array core was handed, and one `Object.is` settles it.
  {
    scenario: search,
    rows: { redux: 0, zustand: 0, "mobx-state-tree": 0, mobx: 0 },
  },
];

const cases = expectations.flatMap(({ scenario, rows }) =>
  fixtures.map((fixture) => ({
    adapter: fixture.name,
    scenario: scenario.name,
    fixture,
    step: scenario,
    rows: rows[fixture.name],
  })),
);

describe(`one remote change over Yjs, ${SIZE} rows`, () => {
  it("covers every registered fixture", () => {
    expect(fixtures.map((fixture) => fixture.name)).toEqual([
      "redux",
      "zustand",
      "mobx-state-tree",
      "mobx",
    ]);
    expect(cases.every((one) => one.rows !== undefined)).toBe(true);
  });

  it.each(cases)(
    "$adapter re-renders $rows rows on $scenario",
    async ({ fixture, step, rows }) => {
      const result = await measure(fixture, step, SIZE);

      expect(result.rowRenders).toBe(rows);
      expect(result.appRenders).toBe(0);
    },
  );

  it("leaves the list alone when only a top-level string changed", async () => {
    const result = await measure(redux, search, SIZE);

    expect(result.listRenders).toBe(0);
    expect(result.searchBoxRenders).toBe(1);
  });

  it("does not even re-render the list container when a row is reconciled in place", async () => {
    // The array itself is untouched, so only the row that changed re-renders. The immutable
    // stores hand the list a new array and re-render the container.
    expect((await measure(mobxStateTree, toggle, SIZE)).listRenders).toBe(0);
    expect((await measure(mobx, toggle, SIZE)).listRenders).toBe(0);
    expect((await measure(redux, toggle, SIZE)).listRenders).toBe(1);
  });

  it("leaves the MobX list untouched when only a top-level string changed", async () => {
    const result = await measure(mobx, search, SIZE);

    expect(result.listRenders).toBe(0);
    expect(result.searchBoxRenders).toBe(1);
  });

  it("reports the advisory timings alongside the counts", async () => {
    const result = await measure(mobx, toggle, SIZE);

    expect(result.mountMs).toBeGreaterThan(0);
    expect(result.applyMs).toBeGreaterThan(0);
    expect(result.commitMs).toBeGreaterThan(0);
  });
});

/** A fixture with no row component at all: the whole list is one component. */
const listOnly: Fixture = {
  name: "list-only",
  description:
    "renders rows as plain elements, so there is nothing to memoize per row",

  create: (initial) => {
    const counters = createCounters();
    const store = createStore(initial);

    const App = () => {
      counters.app++;
      const state = useSyncExternalStore(
        store.adapter.subscribe,
        store.getState,
      );
      counters.list++;
      return (
        <ul>
          {state.todos.map((todo) => (
            <li key={todo.id}>{todo.title}</li>
          ))}
        </ul>
      );
    };

    return { adapter: store.adapter, tree: <App />, counters };
  },
};

describe("the acceptance criterion for a fixture", () => {
  it("rejects a fixture that does not render one component per row", async () => {
    // Memoizing a level too high is the one way this benchmark could quietly flatter an
    // adapter: put `observer` on the list only and MobX's defect disappears.
    await expect(measure(listOnly, toggle, 8)).rejects.toThrow(
      /row components/,
    );
  });
});
