import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

export const doc = new Y.Doc();

export const provider = new WebsocketProvider(
  "ws://localhost:1234",
  "homeostate-counter",
  doc,
);

/** Resolves once the provider has received the room's state. */
const synced = (provider: WebsocketProvider) =>
  new Promise<void>((resolve) => {
    if (provider.synced) {
      resolve();
      return;
    }
    const onSync = (isSynced: boolean) => {
      if (!isSynced) return;
      provider.off("sync", onSync);
      resolve();
    };
    provider.on("sync", onSync);
  });

export const useCounter = create<CounterState>()(
  homeostate(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { backend: createYjsBackend(doc, "shared"), connect: "manual" },
  ),
);

synced(provider).then(() => useCounter.homeostate.connect());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    useCounter.homeostate.disconnect();
    provider.destroy();
    doc.destroy();
  });
}
