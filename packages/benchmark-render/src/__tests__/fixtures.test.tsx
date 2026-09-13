// @vitest-environment jsdom
import { useSyncExternalStore } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  add,
  createStore,
  keystroke,
  move,
  remove,
  search,
  toggle,
} from '@homeostate/benchmark';
import type { Scenario } from '@homeostate/benchmark';
import { createCounters } from '../counters.js';
import { enableActEnvironment } from '../dom.js';
import { measure } from '../driver.js';
import { mobx, redux } from '../fixtures/index.js';
import type { Fixture } from '../types.js';

/**
 * The gate on the fixtures themselves as much as on the adapters: a fixture that memoizes at
 * the wrong level scores whatever the benchmark asks of it, so every number here is one this
 * investigation measured independently and the fixture has to reproduce it.
 *
 * The counts are exact integers on every machine. Row renders are what a user feels; the
 * timings the report carries alongside them are advisory and are not asserted.
 */

const SIZE = 200;

beforeAll(enableActEnvironment);

interface Expectation {
  scenario: Scenario;
  /** What a store that preserves the identity core hands it re-renders. */
  redux: number;
  /**
   * What `adapter-mobx` re-renders: every row, on every change, because `setState` assigns
   * whole plain arrays into observable fields (`packages/adapter-mobx/src/adapter.ts:48-52`).
   * Reconciling in place would make each of these match the redux column, and these
   * expectations are then the thing to update.
   */
  mobx: number;
}

const expectations: Expectation[] = [
  { scenario: toggle, redux: 1, mobx: SIZE },
  { scenario: keystroke, redux: 1, mobx: SIZE },
  // The added row has to mount whatever the adapter does; MobX rebuilds the other 200 too.
  { scenario: add, redux: 1, mobx: SIZE + 1 },
  // Deleting a row costs nothing: the survivors keep their references.
  { scenario: remove, redux: 0, mobx: SIZE - 1 },
  // The moved row is rebuilt with identical data, which is core's one wasted render.
  { scenario: move, redux: 1, mobx: SIZE },
  // A top-level string that no row reads. This is the case that shows the MobX cost is not
  // about the change being large: nothing in the list changed at all.
  { scenario: search, redux: 0, mobx: SIZE },
];

describe(`one remote change over Yjs, ${SIZE} rows`, () => {
  it.each(expectations)('redux re-renders $redux rows on $scenario.name', async ({ scenario, redux: rows }) => {
    const result = await measure(redux, scenario, SIZE);

    expect(result.rowRenders).toBe(rows);
    expect(result.appRenders).toBe(0);
  });

  it.each(expectations)('mobx re-renders $mobx rows on $scenario.name', async ({ scenario, mobx: rows }) => {
    const result = await measure(mobx, scenario, SIZE);

    expect(result.rowRenders).toBe(rows);
    expect(result.appRenders).toBe(0);
  });

  it('leaves the list alone when only a top-level string changed', async () => {
    const result = await measure(redux, search, SIZE);

    expect(result.listRenders).toBe(0);
    expect(result.searchBoxRenders).toBe(1);
  });

  it('reports the advisory timings alongside the counts', async () => {
    const result = await measure(redux, toggle, SIZE);

    expect(result.mountMs).toBeGreaterThan(0);
    expect(result.applyMs).toBeGreaterThan(0);
    expect(result.commitMs).toBeGreaterThan(0);
  });
});

/** A fixture with no row component at all: the whole list is one component. */
const listOnly: Fixture = {
  name: 'list-only',
  description: 'renders rows as plain elements, so there is nothing to memoize per row',

  create: (initial) => {
    const counters = createCounters();
    const store = createStore(initial);

    const App = () => {
      counters.app++;
      const state = useSyncExternalStore(store.adapter.subscribe, store.getState);
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

describe('the acceptance criterion for a fixture', () => {
  it('rejects a fixture that does not render one component per row', async () => {
    // Memoizing a level too high is the one way this benchmark could quietly flatter an
    // adapter: put `observer` on the list only and MobX's defect disappears.
    await expect(measure(listOnly, toggle, 8)).rejects.toThrow(/row components/);
  });
});
