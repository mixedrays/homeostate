/** One framework's playground: a separately built app with its own landing page and demos. */
export interface Playground {
  id: string;
  name: string;
  description: string;
  /** Short labels for the stores and demos the playground shows off. */
  tags: readonly string[];
  /** The colour of the card's mark and call to action. */
  accent: string;
  /** The root script that starts this playground on its own. */
  command: string;
  url: string;
}

const env = import.meta.env;

/**
 * Where a playground lives: an explicit URL from the environment, its dev server when this
 * page runs in development, or a path next to this page in production.
 */
function locate(override: string | undefined, port: number, path: string) {
  return override ?? (env.DEV ? `http://localhost:${port}` : path);
}

export const playgrounds: readonly Playground[] = [
  {
    id: "react",
    name: "React",
    description:
      "A shared todo list built with seven state managers, and a collaborative text editor with names and live cursors.",
    tags: [
      "Zustand",
      "MobX",
      "Redux",
      "Jotai",
      "Valtio",
      "TanStack Store",
      "MobX-State-Tree",
    ],
    accent: "#0e7490",
    command: "pnpm playground:react",
    url: locate(env.VITE_PLAYGROUND_REACT_URL, 5181, "/react/"),
  },
  {
    id: "angular",
    name: "Angular",
    description:
      "The shared todo list as a standalone Angular app with an NgRx SignalStore.",
    tags: ["NgRx Signals"],
    accent: "#a21c55",
    command: "pnpm playground:angular",
    url: locate(env.VITE_PLAYGROUND_ANGULAR_URL, 4200, "/angular/"),
  },
  {
    id: "vue",
    name: "Vue",
    description:
      "The shared todo list as a Vue app reading a TanStack Store through refs.",
    tags: ["TanStack Store"],
    accent: "#1f7a54",
    command: "pnpm playground:vue",
    url: locate(env.VITE_PLAYGROUND_VUE_URL, 5182, "/vue/"),
  },
];
