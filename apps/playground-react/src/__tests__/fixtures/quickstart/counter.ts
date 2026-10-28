import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

export const doc = new Y.Doc();

export const useCounter = create<CounterState>()(
  homeostate(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { backend: createYjsBackend(doc, "shared"), connect: "manual" },
  ),
);

export const provider = new WebsocketProvider(
  "ws://localhost:1234",
  "homeostate-counter",
  doc,
);

provider.once("sync", () => useCounter.homeostate.connect());

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    useCounter.homeostate.disconnect();
    provider.destroy();
    doc.destroy();
  });
}
