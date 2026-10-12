import { onPageHost } from "@homeostate/playground/shared";

export const SYNC_SERVER_URL: string = onPageHost(
  import.meta.env.VITE_SYNC_SERVER_URL ?? "ws://localhost:9999",
);

/** The landing page that links to every framework's playground. */
export const PLAYGROUNDS_URL: string = onPageHost(
  import.meta.env.VITE_PLAYGROUNDS_URL ??
    (import.meta.env.DEV ? "http://localhost:5180" : "/"),
);
