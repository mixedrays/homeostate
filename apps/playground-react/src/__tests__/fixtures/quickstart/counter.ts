import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

export const doc = new Y.Doc();

export const useCounter = create<CounterState>()(
  homeostate(
    createYjsBackend(doc, "shared"),
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { seed: "never" },
  ),
);

export const provider = new WebsocketProvider(
  "ws://localhost:1234",
  "homeostate-counter",
  doc,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    useCounter.homeostate.disconnect();
    provider.destroy();
    doc.destroy();
  });
}
