import { createRoot } from "react-dom/client";
import { HomeostateDevtools } from "./devtools";
import type { DevtoolsOptions } from "./options";

/**
 * Renders the devtools into a React root of their own, for `mountDevtools`. The root's
 * container stays detached: the devtools render into a shadow root on `document.body`.
 */
export function renderDevtools(options: DevtoolsOptions) {
  const root = createRoot(document.createElement("div"));
  const render = (next: DevtoolsOptions): void =>
    root.render(<HomeostateDevtools {...next} />);
  render(options);
  return { render, unmount: () => root.unmount() };
}
