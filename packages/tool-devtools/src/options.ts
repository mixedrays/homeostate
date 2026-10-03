import type { DevtoolsSource } from "./inspector";

/*
 * The devtools' options, apart from any React type, so the declarations of the `/mount`
 * entry stay usable in apps without React.
 */

export type ButtonPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type PanelPosition = "right" | "left" | "bottom" | "top";

export type DevtoolsTheme = "system" | "light" | "dark";

export interface HomeostateDevtoolsProps {
  /** The stores to inspect. With more than one, the panel shows a switcher. */
  sources: DevtoolsSource[];
  /** Viewport corner of the floating button. Defaults to `"bottom-right"`. */
  buttonPosition?: ButtonPosition;
  /** Viewport edge the panel docks to. Defaults to `"right"`. */
  panelPosition?: PanelPosition;
  /** Whether the panel starts open, until it is opened or closed once. Defaults to `false`. */
  initialIsOpen?: boolean;
  /**
   * Controls whether the panel is open, for opening it from the app's own UI. Leave it
   * out to let the devtools manage and remember it.
   */
  open?: boolean;
  /** Called when the floating button, the close button or Escape opens or closes the panel. */
  onOpenChange?: (open: boolean) => void;
  /** Defaults to `"system"`, which follows `prefers-color-scheme`. */
  theme?: DevtoolsTheme;
  /** Log entries kept per source. Defaults to 200. */
  logLimit?: number;
}

/** What `mountDevtools` takes: the props of `HomeostateDevtools`. */
export type DevtoolsOptions = HomeostateDevtoolsProps;
