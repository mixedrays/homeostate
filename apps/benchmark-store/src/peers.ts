import * as Y from "yjs";
import {
  createSyncEngine,
  type StoreAdapter,
  type SyncEngine,
} from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import {
  createStore,
  isTitle,
  makeState,
  type BenchStore,
  type TodoState,
} from "@homeostate/benchmark-crdt";

export interface Pair {
  /** The peer that writes. Its store is the inert one the write-path benchmark uses. */
  writer: BenchStore<TodoState>;
  destroy(): void;
}

/**
 * Two Yjs replicas on a synchronous in-process wire. The writer holds `size` todos; `reader`
 * is the fixture's adapter, whose store starts empty and adopts them through `connect()`, so
 * the rows the components mount have been through a real encode and decode rather than being
 * the writer's own objects.
 */
export const createPair = (
  size: number,
  reader: StoreAdapter<TodoState>,
): Pair => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const relay = Symbol("wire");

  const forward =
    (target: Y.Doc) =>
    (update: Uint8Array, origin: unknown): void => {
      if (origin === relay) return;
      Y.applyUpdate(target, update, relay);
    };
  const toB = forward(docB);
  const toA = forward(docA);
  docA.on("update", toB);
  docB.on("update", toA);

  const writer = createStore(makeState(size));
  const engines: SyncEngine[] = [
    createSyncEngine(
      createYjsBackend(docA, "shared", { text: isTitle }),
      writer.adapter,
    ),
    createSyncEngine(
      createYjsBackend(docB, "shared", { text: isTitle }),
      reader,
    ),
  ];
  engines.forEach((engine) => engine.connect());

  return {
    writer,
    destroy: () => {
      engines.forEach((engine) => engine.disconnect());
      docA.off("update", toB);
      docB.off("update", toA);
      docA.destroy();
      docB.destroy();
    },
  };
};
