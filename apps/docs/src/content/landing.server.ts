// The landing page's quick start, as markdown so it renders like the docs' code blocks.
// landing.test.ts keeps both in step with getting-started.md.

export const INSTALL = `\`\`\`bash install
npm install @homeostate/core @homeostate/store-zustand zustand@^5 @homeostate/crdt-yjs yjs@^13.6.0 y-websocket@^2.1.0
\`\`\``;

export const QUICKSTART = `\`\`\`ts title="src/counter.ts" {13,18-19}
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { create } from "zustand";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { homeostate } from "@homeostate/store-zustand";

type CounterState = { count: number; increment: () => void };

const doc = new Y.Doc();
const provider = new WebsocketProvider("ws://localhost:1234", "counter", doc);

export const useCounter = create<CounterState>()(
  homeostate(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }),
    { backend: createYjsBackend(doc, "shared"), connect: "manual" },
  ),
);

provider.once("sync", () => useCounter.homeostate.connect());
\`\`\``;
