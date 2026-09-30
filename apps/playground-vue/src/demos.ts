/** What a page needs to present itself: its route, heading, blurb and mark. */
export interface PageMeta {
  path: string;
  name: string;
  title: string;
  description: string;
  /** The letter shown in the page's mark. */
  mark: string;
}

export type DemoId = "tanstack-store";

/** One store's version of the todo app. */
export interface DemoMeta extends PageMeta {
  id: DemoId;
  adapter: string;
}

export type AppId = "todo";

/** One of the apps the landing page offers. */
export interface AppMeta extends PageMeta {
  id: AppId;
  /** Short labels for what the app is built with or shows off. */
  tags: readonly string[];
  /** The label of the card's call to action. */
  action: string;
}

export const demos: Record<DemoId, DemoMeta> = {
  "tanstack-store": {
    id: "tanstack-store",
    path: "/todo/tanstack-store",
    name: "TanStack Store",
    title: "TanStack Store Todo",
    description:
      "A Store with an actions factory kept in sync through createTanStackStoreAdapter.",
    adapter: "@homeostate/store-tanstack",
    mark: "T",
  },
};

export const demoList: readonly DemoMeta[] = [demos["tanstack-store"]];

export const apps: Record<AppId, AppMeta> = {
  todo: {
    id: "todo",
    path: "/todo",
    name: "Todo app",
    title: "Todo app",
    description:
      "One shared todo list built with TanStack Store. Every version joins the same Yjs room as the other playgrounds, so a change made in any of them shows up in all the others.",
    mark: "T",
    tags: demoList.map((demo) => demo.name),
    action: "Choose a store",
  },
};

export const appList: readonly AppMeta[] = [apps.todo];
