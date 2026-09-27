import type { GroupId } from "./content/types.ts";

export const site = {
  name: "Homeostate",
  summary:
    "State-manager and CRDT-backend agnostic sync engine: keep a Zustand, Redux, MobX, Jotai, " +
    "Valtio, TanStack Store or MobX-State-Tree store in sync with a Yjs, Loro or Automerge document.",
  repo: "https://github.com/mixedrays/homeostate",
  branch: "main",
  npm: "https://www.npmjs.com/package",
  npmOrg: "https://www.npmjs.com/org/homeostate",
  /** Where `/docs` sends readers. */
  docsHome: "/docs/getting-started",
  /** The guide whose header shows the docs app's version, GitHub and npm. */
  aboutPage: "/docs/about",
} as const;

export const groups: { id: GroupId; title: string }[] = [
  { id: "guides", title: "Guides" },
  { id: "core", title: "Core" },
  { id: "crdt", title: "CRDT backends" },
  { id: "store", title: "Store adapters" },
];

/** Sidebar label and order per package slug; the group comes from the slug's prefix. */
export const packageNav: Record<string, { label: string; order: number }> = {
  core: { label: "Core", order: 0 },
  "crdt-yjs": { label: "Yjs", order: 1 },
  "crdt-loro": { label: "Loro", order: 2 },
  "crdt-automerge": { label: "Automerge", order: 3 },
  "store-zustand": { label: "Zustand", order: 1 },
  "store-redux": { label: "Redux", order: 2 },
  "store-mobx": { label: "MobX", order: 3 },
  "store-mobx-state-tree": { label: "MobX-State-Tree", order: 4 },
  "store-jotai": { label: "Jotai", order: 5 },
  "store-valtio": { label: "Valtio", order: 6 },
  "store-tanstack": { label: "TanStack Store", order: 7 },
};
