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
        createSyncEngine(
          backend,
          createTestStore(threeTodos()).adapter,
        ).connect(),
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

  it("syncs a source with only doc, change and subscribe", () => {
    const handle = createHandle();
    const { doc, change, subscribe } = handle;
    const store = createTestStore({ count: 0 });
    createSyncEngine(
      createAutomergeBackend({ doc, change, subscribe }, NAME),
      store.adapter,
    ).connect();

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
    createSyncEngine(
      createAutomergeBackend(source, NAME),
      store.adapter,
    ).connect();

    handle.change((draft) => {
      (draft[NAME] as { count: number }).count = 1;
    });
    expect(store.getState()).toEqual({ count: 1 });
  });
});
