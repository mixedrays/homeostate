import { describe, expect, it } from 'vitest';
import {
  add,
  emptyState,
  keystroke,
  makeState,
  makeTodo,
  remove,
  replace,
  scenarios,
  toggle,
  toggleAll,
} from '../scenarios.js';
import type { TodoState } from '../types.js';

const SIZE = 10;

const run = (scenario: (typeof scenarios)[number], iterations: number): TodoState => {
  let state = makeState(SIZE);
  for (let i = 0; i < iterations; i++) {
    state = scenario.reset?.(state, SIZE) ?? state;
    state = scenario.step(state, i);
  }
  return state;
};

describe('fixtures', () => {
  it('builds unique, generation-tagged todos', () => {
    const state = makeState(3, 2);
    expect(state.todos.map((todo) => todo.id)).toEqual(['g2:0', 'g2:1', 'g2:2']);
    expect(new Set(makeState(50).todos.map((todo) => todo.title)).size).toBe(50);
    expect(emptyState().todos).toEqual([]);
  });
});

describe('scenarios', () => {
  it('have unique names and change the state on every step', () => {
    expect(new Set(scenarios.map((scenario) => scenario.name)).size).toBe(scenarios.length);
    for (const scenario of scenarios) {
      const before = makeState(SIZE);
      const after = scenario.step(before, 0);
      expect(after, scenario.name).not.toEqual(before);
      expect(before, `${scenario.name} must not mutate its input`).toEqual(makeState(SIZE));
    }
  });

  it('toggle visits a different todo each iteration', () => {
    const state = run(toggle, SIZE);
    expect(state.todos.every((todo) => todo.completed)).toBe(true);
  });

  it('toggle-all flips every todo in one step', () => {
    expect(toggleAll.step(makeState(SIZE), 0).todos.every((todo) => todo.completed)).toBe(true);
    expect(toggleAll.step(makeState(SIZE), 1).todos.some((todo) => todo.completed)).toBe(false);
  });

  it('keystroke grows the middle title and resets it after twenty characters', () => {
    const original = makeTodo(SIZE / 2).title;
    const grown = run(keystroke, 20);
    expect(grown.todos[SIZE / 2].title).toHaveLength(original.length + 20);
    expect(keystroke.reset?.(grown, SIZE).todos[SIZE / 2].title).toBe(original);
    const untouched = run(keystroke, 5);
    expect(keystroke.reset?.(untouched, SIZE)).toBe(untouched);
  });

  it('add and remove drift by one item and their resets restore the size', () => {
    const added = add.step(makeState(SIZE), 0);
    expect(added.todos).toHaveLength(SIZE + 1);
    expect(add.reset?.(added, SIZE).todos).toHaveLength(SIZE);
    const steady = makeState(SIZE);
    expect(add.reset?.(steady, SIZE)).toBe(steady);

    const removed = remove.step(makeState(SIZE), 0);
    expect(removed.todos).toHaveLength(SIZE - 1);
    expect(removed.todos.map((todo) => todo.id)).not.toContain(`g0:${SIZE / 2}`);
    const restored = remove.reset?.(removed, SIZE) as TodoState;
    expect(restored.todos).toHaveLength(SIZE);
    expect(new Set(restored.todos.map((todo) => todo.id)).size).toBe(SIZE);
  });

  it('keeps the size steady over many iterations for every scenario', () => {
    for (const scenario of scenarios) {
      const state = run(scenario, 50);
      expect(state.todos.length, scenario.name).toBeGreaterThanOrEqual(SIZE - 1);
      expect(state.todos.length, scenario.name).toBeLessThanOrEqual(SIZE + 1);
    }
  });

  it('caps the two scenarios that touch every array element', () => {
    expect(toggleAll.maxSize).toBe(1000);
    expect(replace.maxSize).toBe(1000);
    expect(scenarios.filter((scenario) => scenario.maxSize !== undefined)).toHaveLength(2);
  });

  it('replace swaps every id and is capped in size', () => {
    const before = makeState(SIZE);
    const after = replace.step(before, 0);
    expect(after.todos.some((todo) => before.todos.some((old) => old.id === todo.id))).toBe(false);
    expect(replace.step(before, 0)).not.toEqual(replace.step(before, 1));
    expect(replace.maxSize).toBe(1000);
  });
});
