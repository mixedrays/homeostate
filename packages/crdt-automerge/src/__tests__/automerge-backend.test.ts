import * as A from "@automerge/automerge";
import { describe, expect, it } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import {
  createTestStore,
  describeCrdtBackend,
  threeTodos,
  toggleTodo,
  type TodoState,
} from "@homeostate/core/conformance";
import {
  createAutomergeBackend,
  createAutomergeHandle,
  createAutomergePersistable,
  type AutomergeBackendOptions,
  type AutomergeDocSource,
  type AutomergeHandle,
} from "../index.js";

const NAME = "shared";

type Root = Record<string, unknown>;
type Handle = AutomergeHandle<Root>;

const actor = (id: number): string => id.toString(16).padStart(2, "0");

const createHandle = (id?: number): Handle =>
  createAutomergeHandle(
    id === undefined ? A.init<Root>() : A.init<Root>(actor(id)),
  );

const storeIn = (handle: Handle, key: string, value: unknown): void => {
  handle.change((doc) => {
    doc[NAME] ??= {};
    (doc[NAME] as Root)[key] = value;
  });
};

/** What the synced key holds at `path`, as Automerge reads it. */
const at = (handle: Handle, path: (string | number)[]): unknown =>
  path.reduce<unknown>(
    (container, key) => (container as Record<string | number, unknown>)[key],
    handle.doc()[NAME],
  );

describeCrdtBackend("createAutomergeBackend", {
  createDoc: createHandle,
  backend: (handle, options) => createAutomergeBackend(handle, NAME, options),
  exchange: (a, b) => {
    b.update((doc) => A.merge(doc, a.doc()));
    a.update((doc) => A.merge(doc, b.doc()));
  },
  onLocalUpdate: (handle, listener) =>
    handle.subscribe(({ doc, local }) => {
      if (local) listener(A.getLastLocalChange(doc) ?? new Uint8Array());
    }),
  storeForeign: storeIn,
  // Automerge builds maps and lists for every object and array it is given.
  storeForeignContainers: storeIn,
  containerId: (handle, path) => A.getObjectId(at(handle, path) as object),
  // Text reads as a string, and every other string as an `ImmutableString`.
  isText: (handle, path) => typeof at(handle, path) === "string",
});

describe("two peers that each create the synced map", () => {
  const exchange = (a: Handle, b: Handle): void => {
    b.update((doc) => A.merge(doc, a.doc()));
    a.update((doc) => A.merge(doc, b.doc()));
  };

  /** Documents by actors 1 and 2, each creating the synced map with its value, then merged. */
  const competingMaps = (
    low: Root,
    high: Root,
    options?: AutomergeBackendOptions,
  ) => {
    const docLow = createHandle(1);
    const docHigh = createHandle(2);
    createAutomergeBackend(docLow, NAME, options).write(low);
    createAutomergeBackend(docHigh, NAME, options).write(high);
    exchange(docLow, docHigh);
    return { docLow, docHigh };
  };

  /** Every map at the synced key, by the operation that created it. */
  const maps = (handle: Handle) => A.getConflicts(handle.doc(), NAME);

  it("read every map's keys, with the winning map's value for a key both hold", () => {
    const { docLow, docHigh } = competingMaps(
      { count: 1, onlyLow: true },
      { count: 2, onlyHigh: true },
    );

    const merged = { count: 2, onlyLow: true, onlyHigh: true };
    expect(createAutomergeBackend(docLow, NAME).read()).toEqual(merged);
    expect(createAutomergeBackend(docHigh, NAME).read()).toEqual(merged);
    // What an earlier release reads: the map by the higher actor.
    expect(docLow.doc()[NAME]).toEqual({ count: 2, onlyHigh: true });
  });

  it("move the losing map's keys into the winning one on the next write, and empty it", () => {
    const { docLow } = competingMaps(
      { count: 1, onlyLow: { nested: [1] } },
      { count: 2, onlyHigh: true },
    );
    const backend = createAutomergeBackend(docLow, NAME);

    backend.write({ ...backend.read(), added: true });

    const healed = {
      count: 2,
      onlyLow: { nested: [1] },
      onlyHigh: true,
      added: true,
    };
    expect(backend.read()).toEqual(healed);
    expect(maps(docLow)).toEqual({ "1@01": {}, "1@02": healed });
  });

  it("read what the write that moves the keys wrote while it notifies", () => {
    const { docLow } = competingMaps({ onlyLow: true }, { onlyHigh: true });
    const backend = createAutomergeBackend(docLow, NAME);
    const reads: unknown[] = [];
    docLow.subscribe(() => reads.push(backend.read()));

    backend.write({ onlyLow: true, onlyHigh: true, added: true });

    expect(reads).toEqual([{ onlyLow: true, onlyHigh: true, added: true }]);
  });

  it("do not bring back a key deleted by the write that moves it, even one both maps held", () => {
    const { docLow } = competingMaps(
      { count: 1, onlyLow: true },
      { count: 2, onlyHigh: true },
    );
    const backend = createAutomergeBackend(docLow, NAME);

    backend.write({ onlyHigh: true });

    expect(backend.read()).toEqual({ onlyHigh: true });
    expect(maps(docLow)).toEqual({ "1@01": {}, "1@02": { onlyHigh: true } });
  });

  it("read a key that two losing maps hold from the one by the higher actor", () => {
    const docs = [1, 2, 3].map((id) => createHandle(id));
    const values = [{ shared: 1, one: 1 }, { shared: 2, two: 2 }, { three: 3 }];
    docs.forEach((doc, i) =>
      createAutomergeBackend(doc, NAME).write(values[i]),
    );
    exchange(docs[0], docs[1]);
    exchange(docs[1], docs[2]);
    const backend = createAutomergeBackend(docs[1], NAME);
    const merged = { shared: 2, one: 1, two: 2, three: 3 };

    expect(backend.read()).toEqual(merged);
    backend.write(merged);
    expect(docs[1].doc()[NAME]).toEqual(merged);
  });

  it("read and heal two maps in a document stored before this release", () => {
    // An earlier release created the map in each peer's first write.
    const created = (id: number, value: Root) =>
      A.change(A.init<Root>(actor(id)), (doc) => {
        doc[NAME] = value;
      });
    const stored = A.save(
      A.merge(
        created(1, { count: 1, onlyLow: true }),
        created(2, { count: 2 }),
      ),
    );
    const handle = createAutomergeHandle(A.load<Root>(stored, actor(3)));
    const backend = createAutomergeBackend(handle, NAME);

    expect(backend.read()).toEqual({ count: 2, onlyLow: true });
    backend.write({ count: 3, onlyLow: true });
    expect(handle.doc()[NAME]).toEqual({ count: 3, onlyLow: true });
  });

  it("move a key a peer writes into its own map before it sees the move", () => {
    const docLow = createHandle(1);
    const docHigh = createHandle(2);
    const low = createAutomergeBackend(docLow, NAME);
    const high = createAutomergeBackend(docHigh, NAME);
    low.write({ onlyLow: true });
    high.write({ onlyHigh: true });
    docHigh.update((doc) => A.merge(doc, docLow.doc()));
    high.write({ ...high.read(), moved: true });

    low.write({ onlyLow: true, late: true });
    exchange(docLow, docHigh);

    const merged = { onlyLow: true, onlyHigh: true, moved: true, late: true };
    expect(high.read()).toEqual(merged);
    high.write(merged);
    expect(maps(docHigh)).toEqual({ "1@01": {}, "1@02": merged });
  });

  it("lose a peer's edit inside a moved value made before it sees the move", () => {
    const docLow = createHandle(1);
    const docHigh = createHandle(2);
    const low = createAutomergeBackend(docLow, NAME);
    const high = createAutomergeBackend(docHigh, NAME);
    low.write({ todo: { done: false } });
    high.write({ onlyHigh: true });
    docHigh.update((doc) => A.merge(doc, docLow.doc()));
    high.write({ ...high.read(), moved: true });

    // The move copies `todo` into the winning map, so this edits a copy no longer read.
    low.write({ todo: { done: true } });
    exchange(docLow, docHigh);

    expect(high.read()).toEqual({
      todo: { done: false },
      onlyHigh: true,
      moved: true,
    });
  });

  it("store a moved string as the policy says", () => {
    const options = {
      text: (path: readonly (string | number)[]) => path[0] === "title",
    };
    const { docLow } = competingMaps(
      { title: "abc", label: "low" },
      { onlyHigh: true },
      options,
    );
    const backend = createAutomergeBackend(docLow, NAME, options);

    backend.write({ ...backend.read(), title: "abcd" });

    expect(backend.read()).toEqual({
      title: "abcd",
      label: "low",
      onlyHigh: true,
    });
    expect(typeof at(docLow, ["title"])).toBe("string");
    expect(A.isImmutableString(at(docLow, ["label"]))).toBe(true);
  });

  it("keep the unchanged values of a losing map between reads", () => {
    const { docLow } = competingMaps(
      { onlyLow: { nested: [1] } },
      { count: 2 },
    );
    const backend = createAutomergeBackend(docLow, NAME);
    const first = backend.read();
    expect(backend.read()).toBe(first);

    docLow.change((doc) => {
      (doc[NAME] as Root).count = 3;
    });
    const second = backend.read();

    expect(second).toEqual({ count: 3, onlyLow: { nested: [1] } });
    expect(second.onlyLow).toBe(first.onlyLow);
  });

  it("keep every key when the document already holds the map", () => {
    const room = createHandle(1);
    const roomBackend = createAutomergeBackend(room, NAME);
    roomBackend.write({ count: 7 });
    const late = createHandle(2);
    exchange(room, late);
    roomBackend.write({ count: 7, roomOnly: true });
    const store = createTestStore<Root>({ count: 0, mine: true });
    const engine = createSyncEngine({
      backend: createAutomergeBackend(late, NAME),
      adapter: store.adapter,
    });
    engine.connect();

    exchange(room, late);

    expect(roomBackend.read()).toEqual({
      count: 7,
      roomOnly: true,
      mine: true,
    });
    engine.disconnect();
  });
});

describe("createAutomergeBackend", () => {
  it("treats undefined the way JSON.stringify does", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);

    backend.write({ a: undefined, list: [undefined, 1] });
    expect(backend.read()).toEqual({ list: [null, 1] });
    backend.write({ a: 1, b: undefined, list: [null, 1] });
    expect(backend.read()).toEqual({ a: 1, list: [null, 1] });
    backend.write({ a: undefined, list: [null, 1] });
    expect(backend.read()).toEqual({ list: [null, 1] });
  });

  it("creates the synced key when given previous for a document without it", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);
    // What the engine passes after `read()` reported the missing key as an empty object.
    backend.write({ count: 1 }, {});

    expect(backend.read()).toEqual({ count: 1 });
  });

  it.each([
    ["a string", "text", "string"],
    ["a list", [1], "array"],
    ["null", null, "null"],
  ])(
    "throws a TypeError from read() when a peer stores %s at the synced key",
    (_, held, kind) => {
      const handle = createHandle();
      handle.change((doc) => {
        doc[NAME] = held;
      });
      const backend = createAutomergeBackend(handle, NAME);
      const error = new TypeError(
        `The Automerge key "${NAME}" must hold a map, got ${kind}`,
      );

      expect(() => backend.read()).toThrow(error);
      expect(() =>
        createSyncEngine({
          backend,
          adapter: createTestStore(threeTodos()).adapter,
        }).connect(),
      ).toThrow(error);

      backend.write({ count: 1 });
      expect(backend.read()).toEqual({ count: 1 });
    },
  );

  it("reports a peer's update merged while its own write notifies, and only that", () => {
    const handle = createHandle(1);
    const backend = createAutomergeBackend(handle, NAME);
    backend.write({ count: 1 });
    const peer = A.change(A.clone(handle.doc(), actor(2)), (doc) => {
      (doc[NAME] as Root).label = "peer";
    });
    let notified = 0;
    backend.subscribe(() => {
      notified++;
    });
    // A relay that merges a peer's update while it hears about the write.
    const stop = handle.subscribe(({ local }) => {
      if (local) handle.update((doc) => A.merge(doc, peer));
    });

    backend.write({ count: 2 });
    stop();

    expect(backend.read()).toEqual({ count: 2, label: "peer" });
    expect(notified).toBe(1);
  });

  it("shares unchanged subtrees between reads and copies the changed path", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);
    backend.write(threeTodos());
    const first = backend.read() as unknown as TodoState;

    backend.write(toggleTodo(threeTodos(), "1"));
    const second = backend.read() as unknown as TodoState;

    expect(second).toEqual(toggleTodo(threeTodos(), "1"));
    expect(first).toEqual(threeTodos());
    expect(second).not.toBe(first);
    expect(second.todos).not.toBe(first.todos);
    expect(second.todos[0]).not.toBe(first.todos[0]);
    expect(second.todos[1]).toBe(first.todos[1]);
    expect(second.todos[2]).toBe(first.todos[2]);
    expect(Object.getOwnPropertySymbols(second.todos[0])).toEqual([]);
    expect(backend.read()).toBe(second);
  });

  it("keeps its reads and the document apart from a mutated read result", () => {
    const handle = createHandle();
    const backend = createAutomergeBackend(handle, NAME);
    backend.write({ obj: { a: [1] } });

    const first = backend.read() as { obj: { a: number[] } };
    first.obj.a.push(2);

    expect(backend.read()).toEqual({ obj: { a: [1] } });
    expect(handle.doc()[NAME]).toEqual({ obj: { a: [1] } });

    backend.write({ obj: { a: [1, 3] } });
    expect(handle.doc()[NAME]).toEqual({ obj: { a: [1, 3] } });
    expect(backend.read()).toEqual({ obj: { a: [1, 3] } });
  });

  it("copies afresh only what a caller changed in a read result", () => {
    const backend = createAutomergeBackend(createHandle(), NAME);
    backend.write(threeTodos());
    const first = backend.read() as unknown as TodoState;

    first.todos[0].completed = !first.todos[0].completed;
    const second = backend.read() as unknown as TodoState;

    expect(second).toEqual(threeTodos());
    expect(second.todos).not.toBe(first.todos);
    expect(second.todos[0]).not.toBe(first.todos[0]);
    expect(second.todos[1]).toBe(first.todos[1]);
    expect(second.todos[2]).toBe(first.todos[2]);
    expect(backend.read()).toBe(second);
  });

  it("syncs a source with only doc, change and subscribe", () => {
    const handle = createHandle();
    const { doc, change, subscribe } = handle;
    const store = createTestStore({ count: 0 });
    createSyncEngine({
      backend: createAutomergeBackend({ doc, change, subscribe }, NAME),
      adapter: store.adapter,
    }).connect();

    expect(doc()[NAME]).toEqual({ count: 0 });
    handle.update((current) =>
      A.merge(
        current,
        A.change(A.clone(current, actor(2)), (draft) => {
          (draft[NAME] as { count: number }).count = 1;
        }),
      ),
    );
    expect(store.getState()).toEqual({ count: 1 });
  });

  it("hears a source's changes through subscribe even when it also has on", () => {
    const handle = createHandle();
    const { doc, change, subscribe } = handle;
    const source: AutomergeDocSource<Root> & { on: () => void } = {
      doc,
      change,
      subscribe,
      on: () => {},
    };
    const store = createTestStore({ count: 0 });
    createSyncEngine({
      backend: createAutomergeBackend(source, NAME),
      adapter: store.adapter,
    }).connect();

    handle.change((draft) => {
      (draft[NAME] as { count: number }).count = 1;
    });
    expect(store.getState()).toEqual({ count: 1 });
  });
});

describe("text under keys that hold a slash", () => {
  const exchange = (a: Handle, b: Handle): void => {
    b.update((doc) => A.merge(doc, a.doc()));
    a.update((doc) => A.merge(doc, b.doc()));
  };

  it("edits text under a synced key name with a slash", () => {
    const backend = createAutomergeBackend(createHandle(), "app/state", {
      text: () => true,
    });
    backend.write({ title: "abc" });

    backend.write({ title: "abcd" });

    expect(backend.read()).toEqual({ title: "abcd" });
  });

  it("leaves the nested path a synced key name with a slash spells to other code", () => {
    const handle = createHandle();
    handle.change((doc) => {
      doc.app = { state: { title: "other" } };
    });
    const backend = createAutomergeBackend(handle, "app/state", {
      text: () => true,
    });
    backend.write({ title: "abc" });

    backend.write({ title: "abcd" });

    expect(backend.read()).toEqual({ title: "abcd" });
    expect(handle.doc().app).toEqual({ state: { title: "other" } });
  });

  it("keeps both peers' characters when they edit the same text at once", () => {
    const options = { text: () => true };
    const docA = createHandle(1);
    const docB = createHandle(2);
    const a = createAutomergeBackend(docA, NAME, options);
    const b = createAutomergeBackend(docB, NAME, options);
    a.write({ "a/b": "slash" });
    exchange(docA, docB);

    a.write({ "a/b": "slash!" });
    b.write({ "a/b": "Xslash" });
    exchange(docA, docB);

    expect(a.read()).toEqual({ "a/b": "Xslash!" });
    expect(b.read()).toEqual({ "a/b": "Xslash!" });
  });
});

// Automerge 3.4.1 and 3.5.0 patch a document's view wrongly when one merge brings both a delete
// of a list item and a concurrent change that updates that item and inserts after it: the insert
// lands one index too low in the view, while the document itself, as `A.save` keeps it, is right.
// The backend reads the view, so its reads and the writes that diff against them are wrong too.
// The first two tests describe the right behavior and fail until a fixed Automerge is installed.
// Upstream issue: TODO(upstream issue URL).
describe("a delete and a concurrent update with an insert after it, merged at once", () => {
  /**
   * Two peers change `[1, 2]` at once: one sets index 1 to 5 and inserts 6 after it, the other
   * deletes index 1.
   */
  const concurrentEdits = () => {
    const base = A.change(A.init<Root>(actor(1)), (doc) => {
      doc[NAME] = { list: [1, 2] };
    });
    const fork = (id: number) => A.load<Root>(A.save(base), actor(id));
    const left = A.change(fork(2), (doc) => {
      const list = (doc[NAME] as Root).list as number[];
      list[1] = 5;
      A.insertAt(list, 2, 6);
    });
    const right = A.change(fork(3), (doc) => {
      A.deleteAt((doc[NAME] as Root).list as number[], 1);
    });
    const since = A.getHeads(base);
    return {
      fork,
      left,
      right,
      /** Both peers' changes, as one update. */
      update: new Uint8Array([
        ...A.saveSince(left, since),
        ...A.saveSince(right, since),
      ]),
    };
  };

  /** A third peer, synced to a store, that receives both changes in one update. */
  const thirdPeer = () => {
    const edits = concurrentEdits();
    const handle = createAutomergeHandle<Root>(edits.fork(4));
    const backend = createAutomergeBackend(handle, NAME);
    const store = createTestStore<Root>({});
    const engine = createSyncEngine({ backend, adapter: store.adapter });
    engine.connect();
    createAutomergePersistable(handle).apply(edits.update);
    return { ...edits, handle, backend, store, engine };
  };

  /** What the document holds, read afresh from its saved bytes rather than from its view. */
  const saved = (doc: A.Doc<Root>): unknown => A.load<Root>(A.save(doc))[NAME];

  it.fails("reads the list the document holds", () => {
    const { handle, backend, store, engine } = thirdPeer();

    expect(saved(handle.doc())).toEqual({ list: [1, 5, 6] });
    expect(backend.read()).toEqual({ list: [1, 5, 6] });
    expect(store.getState()).toEqual({ list: [1, 5, 6] });
    engine.disconnect();
  });

  it.fails("edits the item the store changed, for every peer", () => {
    const { handle, store, engine, left, right } = thirdPeer();

    // The user edits the 6, wherever the store shows it.
    const { list } = store.getState() as { list: number[] };
    store.setState({ list: list.map((item) => (item === 6 ? 60 : item)) });

    expect(saved(handle.doc())).toEqual({ list: [1, 5, 60] });
    // A peer that received both changes one at a time, so its own view is right.
    const peer = createAutomergeHandle<Root>(A.merge(A.clone(right), left));
    peer.update((doc) =>
      A.loadIncremental(doc, A.saveSince(handle.doc(), A.getHeads(doc))),
    );
    expect(createAutomergeBackend(peer, NAME).read()).toEqual({
      list: [1, 5, 60],
    });
    engine.disconnect();
  });

  // A canary for the upstream fix, in plain Automerge, without homeostate. The view is wrong on
  // the installed Automerge, so the assertion fails and `it.fails` passes. Once this test starts
  // failing, a fixed Automerge is installed: raise the `@automerge/automerge` peer floor to it,
  // make the tests above a plain `it`, update the docs note, and drop this test.
  it.fails(
    "canary: Automerge's own view of the merged document is right",
    () => {
      const { fork, update } = concurrentEdits();

      const merged = A.loadIncremental(fork(4), update);

      expect(merged[NAME]).toEqual({ list: [1, 5, 6] });
    },
  );
});
