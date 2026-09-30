/** One demo the landing page offers. */
export interface DemoMeta {
  path: string;
  name: string;
  description: string;
  /** What the demo is built with. */
  store: string;
}

export const demos: readonly DemoMeta[] = [
  {
    path: "todo",
    name: "Todo app",
    description:
      "A todo list in an NgRx SignalStore kept in sync through createNgrxSignalsAdapter. It joins the same Yjs room as every other playground's todo demo.",
    store: "NgRx Signals",
  },
];
