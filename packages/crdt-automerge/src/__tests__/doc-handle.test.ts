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
      createSyncEngine(
        createAutomergeBackend(aliceHandle, NAME),
        aliceStore.adapter,
      ).connect();
      createSyncEngine(
        createAutomergeBackend(bobHandle, NAME),
        bobStore.adapter,
      ).connect();

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
