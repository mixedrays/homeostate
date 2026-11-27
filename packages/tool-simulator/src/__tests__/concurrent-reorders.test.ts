import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createZustandAdapter } from "@homeostate/store-zustand";
import { createNetwork, createRandom, type Network } from "../index";
import { backends } from "./helpers";

// The diff writes a move as a delete plus an insert, so concurrent reorders duplicate items and
// drop a concurrent edit to the moved one. Known behaviour, described in
// apps/docs/content/concepts.md ("Lists under concurrency"); flip these when a fix lands.

let network: Network | undefined;

afterEach(() => {
  network?.destroy();
  network = undefined;
});

type Docs = (typeof backends)[number][1];

/** Two peers that hold `initial`, written by peer 0, synced, then cut off from each other. */
const splitPeers = async <S extends object>(docs: Docs, initial: S) => {
  const run = createNetwork({ seed: 7 });
  network = run;
  const stores: StoreApi<S>[] = [0, 1].map((index) => {
    const store = createStore<S>(() =>
      index === 0 ? structuredClone(initial) : ({} as S),
    );
    run.addPeer({ adapter: createZustandAdapter(store), ...docs(index) });
    return store;
  });
  await run.settle();
  run.expectConverged();
  run.disconnect(run.peers[0], run.peers[1]);
  return { network: run, stores };
};

/** Reconnects the peers, waits for them to settle and checks that they converged. */
const heal = async (network: Network): Promise<void> => {
  network.heal();
  await network.settle();
  network.expectConverged();
};

interface Item {
  id: string;
  done: boolean;
}

const items = (...ids: string[]): Item[] =>
  ids.map((id) => ({ id, done: false }));

const ids = (list: { id: string }[]): string[] => list.map(({ id }) => id);

describe.each(backends)("concurrent reorders on %s", (_name, docs) => {
  it("duplicate an item both peers move", async () => {
    const { network, stores } = await splitPeers(docs, {
      todos: items("a", "b", "c", "d"),
    });

    stores[0].setState({ todos: items("b", "c", "d", "a") });
    stores[1].setState({ todos: items("b", "c", "d", "a") });
    await heal(network);

    // Each move deletes the same copy of a and inserts its own one at the end.
    expect(ids(stores[0].getState().todos)).toEqual(["b", "c", "d", "a", "a"]);
  });

  it("drop an edit to an item another peer moves", async () => {
    const { network, stores } = await splitPeers(docs, {
      todos: items("a", "b", "c", "d"),
    });

    stores[0].setState({ todos: items("b", "c", "d", "a") });
    stores[1].setState({
      todos: [{ id: "a", done: true }, ...items("b", "c", "d")],
    });
    await heal(network);

    // The edit lands in the copy of a the move deleted.
    expect(stores[0].getState().todos).toEqual(items("b", "c", "d", "a"));
  });

  it("duplicate an item when both peers sort", async () => {
    const { network, stores } = await splitPeers(docs, {
      todos: items("d", "b", "a", "c"),
    });

    stores[0].setState({ todos: items("a", "b", "c", "d") });
    stores[1].setState({ todos: items("a", "b", "c", "d") });
    await heal(network);

    // Both edit d into a in place, and each deletes the old a and inserts d at the end.
    expect(ids(stores[0].getState().todos)).toEqual(["a", "b", "c", "d", "d"]);
  });
});

interface Titled {
  id: string;
  title: string;
}

const byTitle = (a: Titled, b: Titled): number =>
  a.title < b.title
    ? -1
    : a.title > b.title
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

const isSorted = (list: Titled[]): boolean =>
  list.every((item, i) => i === 0 || byTitle(list[i - 1], item) <= 0);

/**
 * Three Yjs peers whose store subscribers keep `todos` sorted by title, as a React effect would,
 * making 60 random appends and title edits. Returns peer 0's final list and what `onError` got.
 */
const runSortedPeers = async (seed: number) => {
  type S = { todos: Titled[] };
  const run = createNetwork({
    seed,
    latency: [0, 30],
    reorder: seed % 2 === 0,
  });
  network = run;
  const random = createRandom(seed * 7919);
  const errors: unknown[] = [];
  const stores = [0, 1, 2].map((index) => {
    const doc = new Y.Doc();
    doc.clientID = index + 1;
    const store = createStore<S>(() =>
      index === 0 ? { todos: [] } : ({} as S),
    );
    store.subscribe((state) => {
      if (state.todos && !isSorted(state.todos))
        store.setState({ todos: [...state.todos].sort(byTitle) });
    });
    run.addPeer({
      adapter: createZustandAdapter(store),
      backend: createYjsBackend(doc, "shared"),
      doc: createYjsPersistable(doc),
      config: { onError: (error) => errors.push(error) },
    });
    return store;
  });
  await run.settle();

  let added = 0;
  for (let step = 0; step < 60; step++) {
    const peer = random.int(3);
    const { todos } = stores[peer].getState();
    if (random.chance(0.7)) {
      const title =
        String.fromCharCode(97 + random.int(26)) + String(random.int(100));
      stores[peer].setState({
        todos: [...todos, { id: `p${peer}-${added++}`, title }],
      });
    } else if (todos.length > 0) {
      const k = random.int(todos.length);
      const title = String.fromCharCode(97 + random.int(26));
      stores[peer].setState({
        todos: todos.map((todo, i) => (i === k ? { ...todo, title } : todo)),
      });
    }
    await run.advance(random.int(15));
  }
  run.heal();
  await run.settle();
  run.expectConverged();
  const todos = stores[0].getState().todos;
  run.destroy();
  network = undefined;
  return { added, todos, errors };
};

describe("peers that keep a synced list sorted in a store subscriber", () => {
  it("converge on a sorted list with duplicated items, the same on every run", async () => {
    const first = await runSortedPeers(15);

    // Each subscriber's sort is a concurrent reorder of the others', so items keep duplicating.
    expect(first.added).toBe(41);
    expect(new Set(ids(first.todos)).size).toBe(41);
    expect(first.todos).toHaveLength(63);
    expect(isSorted(first.todos)).toBe(true);
    expect(first.errors).toEqual([]);

    const second = await runSortedPeers(15);
    expect(second.todos).toEqual(first.todos);
  });
});

// The example from apps/docs/content/concepts.md ("Lists under concurrency"); keep them in step.
interface Todo {
  id: string;
  title: string;
  done: boolean;
  order: number;
}

interface TodoState {
  todos: Record<string, Todo>;
}

/** An order between two neighbours' orders; leave out the one past either end. */
const orderBetween = (before?: number, after?: number): number =>
  before === undefined
    ? after === undefined
      ? 0
      : after - 1
    : after === undefined
      ? before + 1
      : (before + after) / 2;

/** Moves todo `id` between `before` and `after`, changing only its `order`. */
const moveTodo = (
  state: TodoState,
  id: string,
  before?: Todo,
  after?: Todo,
): TodoState => ({
  todos: {
    ...state.todos,
    [id]: {
      ...state.todos[id],
      order: orderBetween(before?.order, after?.order),
    },
  },
});

/** The todos in order, sorted where they are read; ties break by `id`. */
const selectTodos = (state: TodoState): Todo[] =>
  Object.values(state.todos).sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : 1),
  );

describe.each(backends)(
  "keyed todos with an order field on %s",
  (_name, docs) => {
    const initial = (): TodoState => ({
      todos: Object.fromEntries(
        ["a", "b", "c", "d"].map((id, order) => [
          id,
          { id, title: id, done: false, order },
        ]),
      ),
    });

    it("keep one copy of a todo both peers move", async () => {
      const { network, stores } = await splitPeers(docs, initial());

      for (const store of stores) {
        const { todos } = store.getState();
        store.setState(moveTodo(store.getState(), "a", todos.d));
      }
      await heal(network);

      expect(ids(selectTodos(stores[0].getState()))).toEqual([
        "b",
        "c",
        "d",
        "a",
      ]);
    });

    it("keep an edit to a todo another peer moves", async () => {
      const { network, stores } = await splitPeers(docs, initial());

      const { todos } = stores[0].getState();
      stores[0].setState(moveTodo(stores[0].getState(), "a", todos.d));
      stores[1].setState({
        todos: { ...todos, a: { ...todos.a, done: true } },
      });
      await heal(network);

      const ordered = selectTodos(stores[0].getState());
      expect(ids(ordered)).toEqual(["b", "c", "d", "a"]);
      expect(ordered[3]).toMatchObject({ id: "a", done: true, order: 4 });
    });

    it("keep both of two concurrent moves", async () => {
      const { network, stores } = await splitPeers(docs, initial());

      const { todos } = stores[0].getState();
      stores[0].setState(moveTodo(stores[0].getState(), "a", todos.b, todos.c));
      stores[1].setState(
        moveTodo(stores[1].getState(), "d", undefined, todos.a),
      );
      await heal(network);

      expect(ids(selectTodos(stores[0].getState()))).toEqual([
        "d",
        "b",
        "a",
        "c",
      ]);
    });
  },
);
