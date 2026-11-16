// The landing page's quick start, as markdown so it renders like the docs' code blocks, and its
// benefits. landing.test.ts keeps the quick start in step with getting-started.md and checks
// each benefit's link.

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

/** The "why" section; each `to` is a site path whose heading backs the claim. */
export const BENEFITS = [
  {
    title: "Switch CRDTs without touching your store",
    body:
      "Moving between Yjs, Loro and Automerge changes the document setup and the backend " +
      "option. Your state, actions and components stay as they are.",
    link: { label: "How backends plug in", to: "/docs/concepts#crdt-backends" },
  },
  {
    title: "Offline edits merge on reconnect",
    body:
      "When the network drops, your store keeps writing to its local CRDT document, and the " +
      "provider merges those edits with the room's when it reconnects. The CRDT resolves " +
      "conflicts, so there is no merge code to write.",
    link: { label: "Editing offline", to: "/docs/concepts#connecting" },
  },
] as const;
