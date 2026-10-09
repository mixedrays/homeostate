import { describe, expect, it, vi } from "vitest";
import {
  createSyncEngine,
  defaultSyncFilter,
  type CrdtBackend,
  type TextPolicy,
  type Unsubscribe,
} from "../index.js";
import {
  addTodo,
  concurrentReplacements,
  createTestStore,
  deleteTodo,
  expectOneWrittenValue,
  manyTodos,
  nonJsonWrites,
  prototypeHijacks,
  prototypeMemberKeys,
  renameTodo,
  setSearchTerm,
  snapshot,
  threeTodos,
  todo,
  todoTitles,
  toggleTodo,
  unicodeEdits,
  type TodoState,
} from "./helpers.js";

export interface CrdtBackendHarness<D> {
  /**
   * A new, empty document. `id`, where given, is its replica id, which orders concurrent writes;
   * the scenarios that depend on that order run with both orders.
   */
  createDoc: (id?: number) => D;
  /** A new backend over the synced subtree of `doc`. */
  backend: (doc: D, options?: { text?: TextPolicy }) => CrdtBackend;
  /**
   * Bring both documents up to date with each other, as a provider would. Omit it for a backend
   * without replication, such as the memory backend: the scenarios with more than one backend
   * are skipped.
   */
  exchange?: (a: D, b: D) => void;
  /** Report every update a change made on this replica produces, as a provider would send it */
  onLocalUpdate?: (
    doc: D,
    listener: (update: Uint8Array) => void,
  ) => Unsubscribe;
  /** Store `value` under `key` of the synced subtree as other code on this replica would */
  storeForeign?: (doc: D, key: string, value: unknown) => void;
  /**
   * Scenarios this backend is known to fail, by name, each with the reason. They run with
   * `it.fails`, so a fix flips them.
   */
  knownFailures?: Record<string, string>;
}

/** Writes that must leave `read()` equal to what was written: `[before, after]`. */
const roundTrips: [object, object][] = [
  [{ list: [1, 2, 3] }, { list: [0, 1] }],
  [{ list: [2, 3] }, { list: [1, 2, 3, 4] }],
  [{ list: [1, 2] }, { list: [] }],
  [
    {
      list: [
        { id: "1", done: false },
        { id: "2", done: false },
      ],
    },
    {
      list: [
        { id: "0", done: false },
        { id: "1", done: false },
        { id: "2", done: true },
      ],
    },
  ],
  [
    { list: [{ id: "1" }, { id: "2" }, { id: "3" }] },
    { list: [{ id: "1" }, { id: "3" }] },
  ],
  [
    { v: { a: 1 }, s: "a" },
    { v: [1], s: 1 },
  ],
  [{ v: "a" }, { v: { b: "c" } }],
  [
    { n: 1, b: true, z: null },
    { n: 2, b: false, z: null },
  ],
];

/** Plain values other code stores, and the next value written over each: `[kind, stored, next]`. */
const foreignValues: [string, unknown, unknown][] = [
  ["string", "abc", "abd"],
  ["array", [1, 2], [1, 2, 3]],
  ["object", { a: 1 }, { a: 2 }],
];

/** Both orders of two replica ids. */
const replicaOrders: [number, number][] = [
  [1, 2],
  [2, 1],
];

/** Seeded pseudo-random choices (mulberry32), so a failing run replays from its seed. */
interface Random {
  /** An integer in `[0, n)`. */
  int: (n: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

const seededRandom = (seed: number): Random => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  return { int, pick: (items) => items[int(items.length)] };
};

interface EditedTodo {
  id: string;
  title: string;
  completed: boolean;
  note?: unknown;
}

/** What the random edits change: nested containers, text, `undefined`, functions, a local key. */
interface EditedState {
  todos: EditedTodo[];
  tags: unknown[];
  meta: { count: number; owner?: string; nested?: object };
  later?: number;
  action?: () => void;
  /** A local key, which a peer that does not filter it may still write. */
  draft?: string;
}

const onSelect = (): void => {};

const initialEdited = (): EditedState => ({
  todos: [
    { id: "1", title: "Todo 1", completed: false },
    { id: "2", title: "Todo 2", completed: true, note: undefined },
  ],
  tags: ["a", "b"],
  meta: { count: 0 },
  action: onSelect,
});

const withoutDraft = (key: string, value: unknown): boolean =>
  defaultSyncFilter(key, value) && key !== "draft";

/** A store that does not always hold what it is given: it resets `meta.count` past 3. */
const resetCount = (state: EditedState): EditedState =>
  state.meta.count > 3
    ? { ...state, meta: { ...state.meta, count: 0 } }
    : state;

const replaceAt = <T>(items: T[], index: number, item: T): T[] =>
  items.map((existing, i) => (i === index ? item : existing));

/** Immutable edits, as a store makes them, which hold `undefined` and functions at every depth. */
const edits: ((state: EditedState, random: Random) => EditedState)[] = [
  (s, r) => {
    if (s.todos.length === 0) return s;
    const i = r.int(s.todos.length);
    const toggled = { ...s.todos[i], completed: !s.todos[i].completed };
    return { ...s, todos: replaceAt(s.todos, i, toggled) };
  },
  (s, r) => {
    const i = r.int(s.todos.length + 1);
    const added: EditedTodo = {
      id: `t${r.int(100)}`,
      title: "New",
      completed: false,
      ...r.pick([{}, { note: undefined }, { note: onSelect }, { note: "n" }]),
    };
    return {
      ...s,
      todos: [...s.todos.slice(0, i), added, ...s.todos.slice(i)],
    };
  },
  (s, r) => {
    const i = r.int(s.todos.length + 1);
    return { ...s, todos: s.todos.filter((_, j) => j !== i) };
  },
  (s, r) => {
    if (s.todos.length === 0) return s;
    const i = r.int(s.todos.length);
    const { title } = s.todos[i];
    const at = r.int(title.length + 1);
    const renamed = r.pick([
      `${title.slice(0, at)}x${title.slice(at)}`,
      title.slice(0, at) + title.slice(at + 1),
    ]);
    return {
      ...s,
      todos: replaceAt(s.todos, i, { ...s.todos[i], title: renamed }),
    };
  },
  (s, r) => {
    if (s.todos.length === 0) return s;
    const i = r.int(s.todos.length);
    const edited = {
      ...s.todos[i],
      note: r.pick([undefined, onSelect, "note", null]),
    };
    if (r.int(4) === 0) delete edited.note;
    return { ...s, todos: replaceAt(s.todos, i, edited) };
  },
  (s, r) => {
    const i = r.int(s.tags.length);
    const tags = r.pick([
      [...s.tags, `t${r.int(10)}`],
      s.tags.slice(1),
      replaceAt(s.tags, i, undefined),
      replaceAt(s.tags, i, onSelect),
    ]);
    return { ...s, tags };
  },
  (s, r) => ({
    ...s,
    meta: {
      ...s.meta,
      count: s.meta.count + 1,
      owner: r.pick([undefined, "a", "b"]),
    },
  }),
  (s, r) => ({
    ...s,
    meta: {
      ...s.meta,
      nested: r.pick([undefined, { x: r.int(3), list: [1, r.int(3)] }]),
    },
  }),
  (s, r) => {
    const withoutLater = { ...s };
    delete withoutLater.later;
    return r.pick<EditedState>([
      { ...s, later: undefined },
      { ...s, later: r.int(5) },
      withoutLater,
      { ...s, action: r.pick([onSelect, undefined]) },
    ]);
  },
  (s, r) => ({ ...s, draft: `d${r.int(5)}` }),
];

/**
 * Scenarios every `CrdtBackend` must pass, alone and through the sync engine: `read()` matches
 * what was written, as JSON would store it, and replicas that exchange their documents converge.
 */
export const describeCrdtBackend = <D>(
  name: string,
  harness: CrdtBackendHarness<D>,
): void => {
  const {
    createDoc,
    backend,
    exchange,
    onLocalUpdate,
    storeForeign,
    knownFailures = {},
  } = harness;
  const unused = new Set(Object.keys(knownFailures));

  /** Registers the scenario `title`, with `it.fails` when this backend is known to fail it. */
  const scenario = (title: string) => {
    unused.delete(title);
    const reason = knownFailures[title];
    const test = reason === undefined ? it : it.fails;
    const label =
      reason === undefined ? title : `${title} (known failure: ${reason})`;
    return {
      run: (fn: () => void) => test(label, fn),
      each: <T extends unknown[]>(
        cases: T[],
        fn: (...args: NoInfer<T>) => void,
      ) => test.each(cases)(label, (...args) => fn(...(args as T))),
    };
  };

  const peer = <S extends object>(
    doc: D,
    initial: S,
    options?: { text?: TextPolicy },
  ) => {
    const store = createTestStore(initial);
    const peerBackend = backend(doc, options);
    const engine = createSyncEngine(peerBackend, store.adapter);
    engine.connect();
    return { doc, store, backend: peerBackend, engine };
  };

  describe(`${name} conforms to CrdtBackend`, () => {
    scenario("reads an empty document as an empty object").run(() => {
      expect(backend(createDoc()).read()).toEqual({});
    });

    scenario("writes %j -> %j so that read() matches").each(
      roundTrips,
      (before, after) => {
        const written = backend(createDoc());

        written.write(before);
        expect(written.read()).toEqual(before);
        written.write(after);
        expect(written.read()).toEqual(after);
      },
    );

    scenario("does not notify about its own writes").run(() => {
      const written = backend(createDoc());
      const onRemoteChange = vi.fn();
      written.subscribe(onRemoteChange);

      written.write({ count: 1, label: "one" });
      written.write({ count: 2 });

      expect(onRemoteChange).not.toHaveBeenCalled();
    });

    scenario("writes %s as JSON would, and rewrites it without an update").each(
      nonJsonWrites,
      (_, before, next, expected) => {
        const doc = createDoc();
        const written = backend(doc);
        written.write(before);

        expect(() => written.write(next)).not.toThrow();
        expect(written.read()).toEqual(expected);

        const onUpdate = vi.fn();
        onLocalUpdate?.(doc, onUpdate);
        written.write(next);
        expect(onUpdate).not.toHaveBeenCalled();
      },
    );

    if (onLocalUpdate)
      scenario("rewrites %s given it as previous, without an update").each(
        nonJsonWrites,
        (_, before, next, expected) => {
          const doc = createDoc();
          const written = backend(doc);
          written.write(before);
          written.write(next);
          const onUpdate = vi.fn();
          onLocalUpdate(doc, onUpdate);

          written.write(next, next);

          expect(onUpdate).not.toHaveBeenCalled();
          expect(written.read()).toEqual(expected);
        },
      );

    /**
     * A peer whose engine passes `previous` to `write`, or drops it so that the backend diffs
     * against its own document, with a second replica for remote edits when `exchange` is given.
     */
    const editingPeer = (passPrevious: boolean) => {
      const doc = createDoc(1);
      const own = backend(doc, { text: todoTitles });
      const store = createTestStore(initialEdited(), resetCount);
      const engine = createSyncEngine(
        passPrevious ? own : { ...own, write: (next) => own.write(next) },
        store.adapter,
        { filter: withoutDraft },
      );
      engine.connect();
      const peerDoc = createDoc(2);
      const peer = backend(peerDoc, { text: todoTitles });
      exchange?.(doc, peerDoc);

      const steps = [
        "local",
        "local",
        "reconnect",
        ...(exchange ? ["remote", "remote"] : []),
        ...(storeForeign ? ["foreign"] : []),
      ];
      const remoteEdit = (r: Random): void => {
        if (!exchange) return;
        peer.write(r.pick(edits)(peer.read() as EditedState, r));
        exchange(doc, peerDoc);
      };

      const step = (r: Random): string => {
        const kind = r.pick(steps);
        if (kind === "local") store.update((s) => r.pick(edits)(s, r));
        else if (kind === "remote") remoteEdit(r);
        else if (kind === "foreign")
          storeForeign?.(
            doc,
            ...r.pick<[string, unknown]>([
              ["later", r.int(5)],
              ["draft", "foreign"],
              ["meta", { count: r.int(5) }],
            ]),
          );
        else {
          engine.disconnect();
          store.update((s) => r.pick(edits)(s, r));
          if (r.int(2) === 0) remoteEdit(r);
          engine.connect();
        }
        return kind;
      };

      return { read: () => own.read(), store, step };
    };

    scenario(
      "leaves the same document as diffing against its own, over random edits (seed %i)",
    ).each(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed): [number] => [seed]),
      (seed) => {
        const peers = [editingPeer(true), editingPeer(false)];
        const randoms = [seededRandom(seed), seededRandom(seed)];

        for (let i = 0; i < 40; i++) {
          const [kind] = peers.map((peer, p) => peer.step(randoms[p]));
          const label = `seed ${seed}, step ${i}: ${kind}`;
          expect(peers[0].read(), label).toEqual(peers[1].read());
          expect(snapshot(peers[0].store.getState()), label).toEqual(
            snapshot(peers[1].store.getState()),
          );
        }
      },
    );

    scenario("keeps the document when a read result is mutated").run(() => {
      const doc = createDoc();
      backend(doc).write({ obj: { a: [1] } });

      (backend(doc).read() as { obj: { a: number[] } }).obj.a.push(2);

      expect(backend(doc).read()).toEqual({ obj: { a: [1] } });
    });

    if (onLocalUpdate) {
      scenario("sends no update for a write that changes nothing").run(() => {
        const doc = createDoc();
        const written = backend(doc, { text: todoTitles });
        written.write(threeTodos());
        const onUpdate = vi.fn();
        onLocalUpdate(doc, onUpdate);

        written.write(threeTodos());

        expect(onUpdate).not.toHaveBeenCalled();
      });
    }

    if (storeForeign) {
      scenario("reports changes that did not come through write").run(() => {
        const doc = createDoc();
        const watched = backend(doc);
        const onRemoteChange = vi.fn();
        watched.subscribe(onRemoteChange);

        storeForeign(doc, "count", 1);

        expect(onRemoteChange).toHaveBeenCalledTimes(1);
        expect(watched.read()).toEqual({ count: 1 });
      });

      scenario("stops notifying after unsubscribe").run(() => {
        const doc = createDoc();
        const onRemoteChange = vi.fn();
        const unsubscribe = backend(doc).subscribe(onRemoteChange);

        unsubscribe();
        storeForeign(doc, "count", 1);

        expect(onRemoteChange).not.toHaveBeenCalled();
      });

      // One scenario per kind, since a backend may fail some kinds and not others.
      for (const [kind, stored, next] of foreignValues)
        scenario(`adopts a foreign plain ${kind} on the next write`).run(() => {
          const doc = createDoc();
          const written = backend(doc);
          written.write({ count: 1 });
          storeForeign(doc, "k", snapshot(stored));

          written.write({ count: 2, k: next });

          expect(written.read()).toEqual({ count: 2, k: next });
        });

      scenario(
        "keeps the document when a read of a foreign value is mutated",
      ).run(() => {
        const doc = createDoc();
        storeForeign(doc, "obj", { a: [1] });

        (backend(doc).read() as { obj: { a: number[] } }).obj.a.push(2);

        expect(backend(doc).read()).toEqual({ obj: { a: [1] } });
      });

      scenario(
        "never lets a __proto__ key in a value other code stored reach the store",
      ).run(() => {
        const doc = createDoc();
        storeForeign(
          doc,
          "settings",
          JSON.parse('{"theme":"dark","__proto__":{"isAdmin":true}}'),
        );
        // A peer decodes the value from an update, which may build it by assignment.
        const docs = [doc];
        if (exchange) {
          const other = createDoc();
          exchange(doc, other);
          docs.push(other);
        }

        for (const reader of docs) {
          const { store } = peer(reader, {});
          expect(store.getState()).toEqual({ settings: { theme: "dark" } });
          expect(prototypeHijacks(store.getState())).toEqual([]);
        }
      });
    }

    if (exchange) {
      const twoSyncedPeers = (
        initial: () => TodoState = threeTodos,
        idA = 1,
        idB = 2,
        options?: { text?: TextPolicy },
      ) => {
        const docA = createDoc(idA);
        const docB = createDoc(idB);
        const a = peer(docA, initial(), options);
        exchange(docA, docB);
        const b = peer(docB, initial(), options);
        return { a, b };
      };

      scenario("reports a remote change once").run(() => {
        const doc = createDoc();
        const local = backend(doc);
        local.write({ count: 1, label: "one" });
        const other = createDoc();
        exchange(doc, other);
        const onRemoteChange = vi.fn();
        local.subscribe(onRemoteChange);

        backend(other).write({ count: 2, label: "one" });
        exchange(doc, other);

        expect(onRemoteChange).toHaveBeenCalledTimes(1);
        expect(local.read()).toEqual({ count: 2, label: "one" });
      });

      scenario(
        "reports writes from another backend over the same document",
      ).run(() => {
        const doc = createDoc();
        const watched = backend(doc);
        const onRemoteChange = vi.fn();
        watched.subscribe(onRemoteChange);

        backend(doc).write({ count: 1 });

        expect(onRemoteChange).toHaveBeenCalledTimes(1);
        expect(watched.read()).toEqual({ count: 1 });
      });

      scenario("keeps a toggle on A and an add on B").run(() => {
        const { a, b } = twoSyncedPeers();

        a.store.update((s) => toggleTodo(s, "1"));
        b.store.update((s) => addTodo(s, todo("4")));
        exchange(a.doc, b.doc);

        const expected = addTodo(toggleTodo(threeTodos(), "1"), todo("4"));
        expect(a.store.getState()).toEqual(expected);
        expect(b.store.getState()).toEqual(expected);
      });

      scenario(
        "keeps a delete of t2 on A and a toggle of t3 on B (replica ids %i and %i)",
      ).each(replicaOrders, (idA, idB) => {
        const { a, b } = twoSyncedPeers(threeTodos, idA, idB);

        a.store.update((s) => deleteTodo(s, "2"));
        b.store.update((s) => toggleTodo(s, "3"));
        exchange(a.doc, b.doc);

        const expected = toggleTodo(deleteTodo(threeTodos(), "2"), "3");
        expect(a.store.getState()).toEqual(expected);
        expect(b.store.getState()).toEqual(expected);
      });

      scenario("keeps typed search text on A and a toggle on B").run(() => {
        const { a, b } = twoSyncedPeers();

        for (const term of ["a", "ab", "abc"])
          a.store.update((s) => setSearchTerm(s, term));
        b.store.update((s) => toggleTodo(s, "2"));
        exchange(a.doc, b.doc);

        const expected = toggleTodo(setSearchTerm(threeTodos(), "abc"), "2");
        expect(a.store.getState()).toEqual(expected);
        expect(b.store.getState()).toEqual(expected);
      });

      scenario("merges concurrent renames of the same todo character-wise").run(
        () => {
          const { a, b } = twoSyncedPeers(threeTodos, 1, 2, {
            text: todoTitles,
          });

          a.store.update((s) => renameTodo(s, "1", "Todo 1 A"));
          b.store.update((s) => renameTodo(s, "1", "B Todo 1"));
          exchange(a.doc, b.doc);

          expect(a.store.getState().todos[0].title).toBe("B Todo 1 A");
          expect(b.store.getState().todos[0].title).toBe("B Todo 1 A");
        },
      );

      scenario(
        "gives the receiver new containers along the changed path only",
      ).run(() => {
        const { a, b } = twoSyncedPeers();
        const before = b.store.getState();
        const beforeSnapshot = snapshot(before);

        a.store.update((s) => toggleTodo(s, "1"));
        exchange(a.doc, b.doc);

        const after = b.store.getState();
        expect(after).toEqual(toggleTodo(threeTodos(), "1"));
        expect(after).not.toBe(before);
        expect(after.todos).not.toBe(before.todos);
        expect(after.todos[0]).not.toBe(before.todos[0]);
        expect(after.todos[1]).toBe(before.todos[1]);
        expect(after.todos[2]).toBe(before.todos[2]);
        expect(before).toEqual(beforeSnapshot);
      });

      scenario(
        "late joiner adopts existing todos without wiping them (replica ids %i and %i)",
      ).each(replicaOrders, (idA, idB) => {
        const docA = createDoc(idA);
        const docB = createDoc(idB);
        const a = peer(docA, threeTodos());
        exchange(docA, docB);

        const b = peer(docB, {
          ...threeTodos(),
          todos: [todo("local", "Local sample")],
        });
        expect(b.store.getState()).toEqual(threeTodos());

        exchange(docA, docB);
        expect(a.store.getState()).toEqual(threeTodos());
        expect(b.store.getState()).toEqual(threeTodos());
        expect(a.backend.read()).toEqual(threeTodos());
      });

      if (onLocalUpdate)
        scenario(
          "sends one small update per toggle, add, keystroke, and middle delete with 50 todos",
        ).run(() => {
          const { a, b } = twoSyncedPeers(() => manyTodos(50));
          const sizes: number[] = [];
          onLocalUpdate(a.doc, (update) => sizes.push(update.byteLength));

          a.store.update((s) => toggleTodo(s, "25"));
          expect(sizes).toHaveLength(1);
          a.store.update((s) => addTodo(s, todo("51")));
          expect(sizes).toHaveLength(2);
          a.store.update((s) => setSearchTerm(s, "x"));
          expect(sizes).toHaveLength(3);
          a.store.update((s) => deleteTodo(s, "10"));
          expect(sizes).toHaveLength(4);

          expect(sizes.every((size) => size < 200)).toBe(true);
          exchange(a.doc, b.doc);
          expect(b.store.getState()).toEqual(a.store.getState());
        });

      scenario(
        "leaves object entries holding undefined out on the writer and on peers",
      ).run(() => {
        const doc = createDoc();
        const written = backend(doc);
        written.write({ a: 1, b: 1, nested: { c: 1, d: 1 } });

        written.write({ a: undefined, b: 1, nested: { c: undefined, d: 1 } });

        const other = createDoc();
        exchange(doc, other);
        for (const read of [written.read(), backend(other).read()]) {
          const state = read as { nested: object };
          expect(Object.keys(state).sort()).toEqual(["b", "nested"]);
          expect(Object.keys(state.nested)).toEqual(["d"]);
        }
      });

      scenario("keeps a peer's document when a read result is mutated").run(
        () => {
          const doc = createDoc();
          const written = backend(doc);
          written.write({ obj: { a: [1] } });

          (written.read() as { obj: { a: number[] } }).obj.a.push(2);

          const other = createDoc();
          exchange(doc, other);
          expect(backend(other).read()).toEqual({ obj: { a: [1] } });
        },
      );

      scenario("replicates adding and deleting a %s key").each(
        prototypeMemberKeys.map((key): [string] => [key]),
        (key) => {
          const initial = () => ({
            byName: { bob: 1 } as Record<string, number>,
          });
          const docA = createDoc();
          const docB = createDoc();
          const a = peer(docA, initial());
          exchange(docA, docB);
          const b = peer(docB, initial());

          a.store.setState({ byName: { bob: 1, [key]: 2 } });
          exchange(docA, docB);
          expect(b.store.getState().byName[key]).toBe(2);

          a.store.setState({ byName: { bob: 1 } });
          exchange(docA, docB);
          const written = a.backend.read() as { byName: object };
          expect(Object.keys(written.byName)).toEqual(["bob"]);
          expect(Object.keys(b.store.getState().byName)).toEqual(["bob"]);
        },
      );

      scenario("replicates %j to %j through both stores").each(
        unicodeEdits,
        (before, after) => {
          const initial = () => {
            const state = threeTodos();
            state.todos[0].title = before;
            state.searchTerm = before;
            return state;
          };
          // Titles are text and the search term a plain value, so both kinds round-trip.
          const { a, b } = twoSyncedPeers(initial, 1, 2, { text: todoTitles });
          try {
            a.store.update((state) => ({
              ...renameTodo(state, "1", after),
              searchTerm: after,
            }));
            const expected = {
              ...renameTodo(initial(), "1", after),
              searchTerm: after,
            };
            expect(a.backend.read()).toEqual(expected);
            exchange(a.doc, b.doc);
            expect(b.backend.read()).toEqual(expected);
            expect(a.store.getState()).toEqual(expected);
            expect(b.store.getState()).toEqual(expected);
          } finally {
            a.engine.disconnect();
            b.engine.disconnect();
          }
        },
      );

      scenario(
        "merges an emoji replacement with a peer's surrounding text edits",
      ).run(() => {
        const { a, b } = twoSyncedPeers(
          () => ({ ...threeTodos(), searchTerm: "a😀b" }),
          1,
          2,
          { text: (path) => path[0] === "searchTerm" },
        );
        try {
          a.store.update((state) => setSearchTerm(state, "a😃b"));
          b.store.update((state) => setSearchTerm(state, "prefix a😀b suffix"));
          exchange(a.doc, b.doc);
          expect(a.store.getState().searchTerm).toBe("prefix a😃b suffix");
          expect(b.store.getState()).toEqual(a.store.getState());
          expect(a.backend.read()).toEqual(b.backend.read());
        } finally {
          a.engine.disconnect();
          b.engine.disconnect();
        }
      });

      scenario(
        "keeps one written value of short strings replaced at once (replica ids %i and %i)",
      ).each(replicaOrders, (idA, idB) => {
        const { before, a, b } = concurrentReplacements;
        const docA = createDoc(idA);
        const docB = createDoc(idB);
        const backendA = backend(docA);
        backendA.write(before);
        exchange(docA, docB);
        const backendB = backend(docB);

        backendA.write(a);
        backendB.write(b);
        exchange(docA, docB);

        expectOneWrittenValue(backendA.read());
        expect(backendB.read()).toEqual(backendA.read());
      });
    }

    // Scenarios register as this callback runs, so only now is every name known.
    if (unused.size > 0)
      throw new Error(
        `${name} lists known failures that match no scenario: ${[...unused].join(", ")}`,
      );
  });
};
