import {
  Atom,
  Box,
  Layers,
  ListTodo,
  Orbit,
  Package,
  Shapes,
  TextCursorInput,
  TreePine,
  Waves,
  type LucideIcon,
} from "lucide-react";

/** The landing page that links to every framework's playground. */
export const PLAYGROUNDS_URL: string =
  import.meta.env.VITE_PLAYGROUNDS_URL ??
  (import.meta.env.DEV ? "http://localhost:5180" : "/");

/** The whiteboard, a React app built on its own that this landing page links to. */
export const WHITEBOARD_URL: string =
  import.meta.env.VITE_PLAYGROUND_WHITEBOARD_URL ??
  (import.meta.env.DEV ? "http://localhost:5184" : "/whiteboard/");

export type DemoId =
  | "zustand"
  | "mobx"
  | "redux"
  | "jotai"
  | "valtio"
  | "tanstack-store"
  | "mobx-state-tree";
export type DemoAccent =
  | "blue"
  | "violet"
  | "emerald"
  | "cyan"
  | "rose"
  | "orange"
  | "fuchsia"
  | "indigo"
  | "teal"
  | "amber";

/** What a page needs to present itself: its heading, blurb, colour and icon. */
export interface PageMeta {
  path: string;
  name: string;
  title: string;
  description: string;
  accent: DemoAccent;
  icon: LucideIcon;
}

/** One store's version of the todo app. */
export interface DemoMeta extends PageMeta {
  id: DemoId;
  adapter: string;
}

export type AppId = "todo" | "editor" | "whiteboard";

/** Where a card leads: a page of this app, or an app built on its own. */
export type CardTarget = { path: string } | { url: string };

/** One of the apps the landing page offers. */
export type AppMeta = Omit<PageMeta, "path"> &
  CardTarget & {
    id: AppId;
    /** Short labels for what the app is built with or shows off. */
    tags: readonly string[];
    /** The label of the card's call to action. */
    action: string;
  };

export const demos: Record<DemoId, DemoMeta> = {
  zustand: {
    id: "zustand",
    path: "/todo/zustand",
    name: "Zustand",
    title: "Zustand Todo",
    description:
      "A hook-based store kept in sync through createZustandAdapter.",
    adapter: "@homeostate/store-zustand",
    accent: "blue",
    icon: Box,
  },
  mobx: {
    id: "mobx",
    path: "/todo/mobx",
    name: "MobX",
    title: "MobX Todo",
    description:
      "An observable class store kept in sync through createMobxAdapter.",
    adapter: "@homeostate/store-mobx",
    accent: "violet",
    icon: Atom,
  },
  redux: {
    id: "redux",
    path: "/todo/redux",
    name: "Redux",
    title: "Redux Todo",
    description:
      "A Redux Toolkit slice kept in sync through createReduxAdapter.",
    adapter: "@homeostate/store-redux",
    accent: "emerald",
    icon: Layers,
  },
  jotai: {
    id: "jotai",
    path: "/todo/jotai",
    name: "Jotai",
    title: "Jotai Todo",
    description:
      "Atoms composed into one writable root atom kept in sync through createJotaiAdapter.",
    adapter: "@homeostate/store-jotai",
    accent: "cyan",
    icon: Orbit,
  },
  valtio: {
    id: "valtio",
    path: "/todo/valtio",
    name: "Valtio",
    title: "Valtio Todo",
    description:
      "A mutable proxy state kept in sync through createValtioAdapter.",
    adapter: "@homeostate/store-valtio",
    accent: "rose",
    icon: Waves,
  },
  "tanstack-store": {
    id: "tanstack-store",
    path: "/todo/tanstack-store",
    name: "TanStack Store",
    title: "TanStack Store Todo",
    description:
      "A Store with an actions factory kept in sync through createTanStackStoreAdapter.",
    adapter: "@homeostate/store-tanstack",
    accent: "orange",
    icon: Package,
  },
  "mobx-state-tree": {
    id: "mobx-state-tree",
    path: "/todo/mobx-state-tree",
    name: "MobX-State-Tree",
    title: "MobX-State-Tree Todo",
    description:
      "A typed model tree kept in sync through its snapshots with createMobxStateTreeAdapter.",
    adapter: "@homeostate/store-mobx-state-tree",
    accent: "fuchsia",
    icon: TreePine,
  },
};

export const demoList: readonly DemoMeta[] = [
  demos.zustand,
  demos.mobx,
  demos.redux,
  demos.jotai,
  demos.valtio,
  demos["tanstack-store"],
  demos["mobx-state-tree"],
];

export const apps = {
  todo: {
    id: "todo",
    path: "/todo",
    name: "Todo app",
    title: "Todo app",
    description:
      "One shared todo list built with seven state managers. Every version joins the same Yjs room as the other playgrounds, so a change made in any of them shows up in all the others.",
    accent: "indigo",
    icon: ListTodo,
    tags: demoList.map((demo) => demo.name),
    action: "Choose a store",
  },
  editor: {
    id: "editor",
    path: "/editor",
    name: "Collaborative text editor",
    title: "Collaborative Text Editor",
    description:
      "One document typed into from several tabs at once, with every writer's name and cursor. The text is a plain string in a Zustand store; homeostate syncs it into a Y.Text, so edits made at the same time merge character by character.",
    accent: "teal",
    icon: TextCursorInput,
    tags: ["Zustand", "Y.Text", "Live cursors", "Names"],
    action: "Open the editor",
  },
  whiteboard: {
    id: "whiteboard",
    url: WHITEBOARD_URL,
    name: "Whiteboard",
    title: "Whiteboard",
    description:
      "One board drawn on from several tabs at once: boxes, arrows and text, with every artist's name and cursor. A separate app built with shadcn/ui and Tailwind, whose Zustand store keys shapes by id, so a move and a recolour made at once both stay.",
    accent: "amber",
    icon: Shapes,
    tags: ["Zustand", "shadcn/ui", "Live cursors", "Names"],
    action: "Open the whiteboard",
  },
} satisfies Record<AppId, AppMeta>;

export const appList: readonly AppMeta[] = [
  apps.todo,
  apps.editor,
  apps.whiteboard,
];

export const accentClass: Record<DemoAccent, string> = {
  blue: "theme-blue",
  violet: "theme-violet",
  emerald: "theme-emerald",
  cyan: "theme-cyan",
  rose: "theme-rose",
  orange: "theme-orange",
  fuchsia: "theme-fuchsia",
  indigo: "theme-indigo",
  teal: "theme-teal",
  amber: "theme-amber",
};
