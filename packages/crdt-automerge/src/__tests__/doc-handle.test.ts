import * as A from "@automerge/automerge";
import {
  NetworkAdapter,
  Repo,
  type DocHandle,
  type Message,
  type PeerId,
} from "@automerge/automerge-repo";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createSyncEngine } from "@homeostate/core";
import {
  createTestStore,
  describeCrdtBackend,
} from "@homeostate/core/conformance";
import { createAutomergeBackend } from "../index.js";

const NAME = "shared";

type Root = Record<string, unknown>;

const repo = new Repo();
afterAll(() => repo.shutdown());

const actor = (id: number): string => id.toString(16).padStart(2, "0");

const createDocHandle = (id?: number): DocHandle<Root> => {
  const handle = repo.create<Root>();
  if (id !== undefined) handle.update((doc) => A.clone(doc, actor(id)));
  return handle;
};

describeCrdtBackend("createAutomergeBackend with a DocHandle", {
  createDoc: createDocHandle,
  backend: (handle, options) => createAutomergeBackend(handle, NAME, options),
  exchange: (a, b) => {
    b.merge(a);
    a.merge(b);
  },
  onLocalUpdate: (handle, listener) => {
    // The changes this replica's actor made, as a network adapter would send them.
    const onChange = ({
      patchInfo: { before, after },
    }: {
      patchInfo: A.PatchInfo<Root>;
    }): void => {
      const self = A.getActorId(after);
      for (const change of A.getChanges(before, after))
        if (A.decodeChange(change).actor === self) listener(change);
    };
    handle.on("change", onChange);
    return () => handle.off("change", onChange);
  },
  storeForeign: (handle, key, value) => {
    handle.change((doc) => {
      doc[NAME] ??= {};
      (doc[NAME] as Root)[key] = value;
    });
  },
});

/** One end of an in-memory network, which delivers each message to the other end. */
class MemoryNetworkAdapter extends NetworkAdapter {
  peer?: MemoryNetworkAdapter;

  isReady(): boolean {
    return true;
  }

  whenReady(): Promise<void> {
    return Promise.resolve();
  }

  connect(peerId: PeerId): void {
    this.peerId = peerId;
    const { peer } = this;
    if (peer?.peerId === undefined) return;
    this.emit("peer-candidate", { peerId: peer.peerId, peerMetadata: {} });
    peer.emit("peer-candidate", { peerId, peerMetadata: {} });
  }

  send(message: Message): void {
    setTimeout(() => this.peer?.emit("message", message));
  }

  disconnect(): void {}
}

describe("createAutomergeBackend with DocHandles of two repos", () => {
  /** Two repos connected over an in-memory network, as two peers would be. */
  const connectRepos = (): [Repo, Repo] => {
    const aliceToBob = new MemoryNetworkAdapter();
    const bobToAlice = new MemoryNetworkAdapter();
    aliceToBob.peer = bobToAlice;
    bobToAlice.peer = aliceToBob;
    return [
      new Repo({ peerId: "alice" as PeerId, network: [aliceToBob] }),
      new Repo({ peerId: "bob" as PeerId, network: [bobToAlice] }),
    ];
  };

  it("syncs the stores through the repos' network", async () => {
    const [alice, bob] = connectRepos();
    try {
      const aliceHandle = alice.create<Root>({ [NAME]: { count: 0 } });
      const bobHandle = await bob.find<Root>(aliceHandle.url);
      const aliceStore = createTestStore({ count: 0 });
      const bobStore = createTestStore({ count: 0 });
      createSyncEngine({
        backend: createAutomergeBackend(aliceHandle, NAME),
        adapter: aliceStore.adapter,
      }).connect();
      createSyncEngine({
        backend: createAutomergeBackend(bobHandle, NAME),
        adapter: bobStore.adapter,
      }).connect();

      aliceStore.setState({ count: 1 });
      await vi.waitFor(() => expect(bobStore.getState()).toEqual({ count: 1 }));

      bobStore.setState({ count: 2 });
      await vi.waitFor(() =>
        expect(aliceStore.getState()).toEqual({ count: 2 }),
      );
    } finally {
      await Promise.all([alice.shutdown(), bob.shutdown()]);
    }
  });
});

describe("createAutomergeBackend with a DocHandle whose listener throws", () => {
  /**
   * Runs `fn` and then the timers it set, returning what those threw. automerge-repo and the
   * backend throw a listener's error from a timer, where it is uncaught, so no caller sees it.
   */
  const timerErrors = (fn: () => void): unknown[] => {
    const callbacks: (() => void)[] = [];
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
    ) => {
      callbacks.push(callback);
      return 0;
    }) as unknown as typeof setTimeout);
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
    const errors: unknown[] = [];
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  };

  /** A change to `handle`'s document made by another peer. */
  const remoteChange = (handle: DocHandle<Root>, change: A.ChangeFn<Root>) =>
    A.change(A.clone(handle.doc(), actor(0xbb)), change);

  it("lets later listeners and the change event hear a change the engine rejects", () => {
    const handle = createDocHandle();
    const store = createTestStore<Root>({});
    createSyncEngine({
      backend: createAutomergeBackend(handle, NAME),
      adapter: {
        ...store.adapter,
        setState: () => {
          throw new Error("rejected");
        },
      },
    }).connect();
    const heads = vi.fn();
    handle.on("heads-changed", heads);
    const change = vi.fn();
    handle.on("change", change);
    const other = remoteChange(handle, (doc) => {
      doc[NAME] = { x: 1 };
    });

    const errors = timerErrors(() =>
      handle.update((doc) => A.merge(doc, other)),
    );

    expect(heads).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([new Error("rejected")]);
  });

  it("calls every backend listener when one throws", () => {
    const handle = createDocHandle();
    const backend = createAutomergeBackend(handle, NAME);
    backend.subscribe(() => {
      throw new Error("first");
    });
    const second = vi.fn();
    backend.subscribe(second);
    const other = remoteChange(handle, (doc) => {
      doc[NAME] = { x: 1 };
    });

    const errors = timerErrors(() =>
      handle.update((doc) => A.merge(doc, other)),
    );

    expect(second).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([new Error("first")]);
  });

  it("includes a change a listener threw on in the next change event's patchInfo.before", () => {
    const handle = createDocHandle();
    const backend = createAutomergeBackend(handle, NAME);
    let throwing = true;
    backend.subscribe(() => {
      if (throwing) throw new Error("once");
    });
    const other = remoteChange(handle, (doc) => {
      doc[NAME] = { x: 1 };
    });
    timerErrors(() => handle.update((doc) => A.merge(doc, other)));
    throwing = false;
    const before = vi.fn();
    handle.on("change", ({ patchInfo }) => before(patchInfo.before));

    handle.change((doc) => {
      doc.y = 2;
    });

    expect(before).toHaveBeenCalledWith({ [NAME]: { x: 1 } });
  });
});
