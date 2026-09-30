/** What a page needs to present itself: its route, heading, blurb and mark. */
export interface PageMeta {
  path: string;
  name: string;
  title: string;
  description: string;
  /** The letter shown in the page's mark. */
  mark: string;
}

export type DemoId = "ngrx-signals";

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
  "ngrx-signals": {
    id: "ngrx-signals",
    path: "/todo/ngrx-signals",
    name: "NgRx Signals",
    title: "NgRx Signals Todo",
    description: "A SignalStore kept in sync through createNgrxSignalsAdapter.",
    adapter: "@homeostate/store-ngrx-signals",
    mark: "N",
  },
};

export const demoList: readonly DemoMeta[] = [demos["ngrx-signals"]];

export const apps: Record<AppId, AppMeta> = {
  todo: {
    id: "todo",
    path: "/todo",
    name: "Todo app",
    title: "Todo app",
    description:
      "One shared todo list built with NgRx Signals. Every version joins the same Yjs room as the other playgrounds, so a change made in any of them shows up in all the others.",
    mark: "T",
    tags: demoList.map((demo) => demo.name),
    action: "Choose a store",
  },
};

export const appList: readonly AppMeta[] = [apps.todo];
