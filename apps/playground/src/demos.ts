import {
  Atom,
  Box,
  Layers,
  ListTodo,
  Orbit,
  Package,
  TextCursorInput,
  TreePine,
  Waves,
  type LucideIcon,
} from "lucide-react";

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
  | "teal";

/** What a page needs to present itself: its heading, blurb, colour and icon. */
export interface PageMeta {
  path: string;
  /** Navigate to a separately built demo instead of using the React router. */
  external?: boolean;
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

export type AppId = "todo" | "editor";

/** One of the apps the landing page offers. */
export interface AppMeta extends PageMeta {
  id: AppId;
  /** Short labels for what the app is built with or shows off. */
  tags: readonly string[];
  /** The label of the card's call to action. */
  action: string;
}

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

export const angularDemo: PageMeta = {
  path:
    import.meta.env.VITE_ANGULAR_PLAYGROUND_URL ??
    (import.meta.env.DEV ? "http://localhost:4200" : "/angular/"),
  external: true,
  name: "Angular · NgRx Signals",
  title: "Angular Todo",
  description:
    "A standalone Angular app using NgRx Signals, sharing the same todos with every React demo.",
  accent: "rose",
  icon: Layers,
};

export const apps: Record<AppId, AppMeta> = {
  todo: {
    id: "todo",
    path: "/todo",
    name: "Todo app",
    title: "Todo app",
    description:
      "One shared todo list built with React and Angular. Every version joins the same Yjs room, so a change made in any of them shows up in all the others.",
    accent: "indigo",
    icon: ListTodo,
    tags: [...demoList.map((demo) => demo.name), "Angular · NgRx Signals"],
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
};

export const appList: readonly AppMeta[] = [apps.todo, apps.editor];

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
};
