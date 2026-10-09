import type { DevtoolsOptions } from "./options";

export type { DevtoolsSource } from "./inspector";
export type {
  ButtonPosition,
  DevtoolsOptions,
  DevtoolsTheme,
  PanelPosition,
} from "./options";

/** The devtools `mountDevtools` put on the page. */
export interface MountedDevtools {
  /** Change some options; the others keep their values. */
  update: (options: Partial<DevtoolsOptions>) => void;
  /** Take the devtools off the page. */
  unmount: () => void;
}

interface Rendered {
  render: (options: DevtoolsOptions) => void;
  unmount: () => void;
}

/**
 * Puts the devtools on the page from any framework, or none: the floating button and the
 * panel of `HomeostateDevtools`, with the same options. The app needs no React; the panel
 * brings its own, and loads in the background, so `mountDevtools` returns at once and adds
 * nothing to the app's initial bundle.
 *
 * @example
 * ```ts
 * const devtools = mountDevtools({
 *   sources: [{ name: "Todos", adapter, backend, engine }],
 * });
 * // Later, e.g. when the page is left:
 * devtools.unmount();
 * ```
 */
export function mountDevtools(options: DevtoolsOptions): MountedDevtools {
  let current = options;
  let mounted = true;
  let rendered: Rendered | undefined;

  import("./render").then(
    ({ renderDevtools }) => {
      if (mounted) rendered = renderDevtools(current);
    },
    (error: unknown) => {
      console.error("[homeostate] could not load the devtools:", error);
    },
  );

  return {
    update: (next) => {
      current = { ...current, ...next };
      rendered?.render(current);
    },
    unmount: () => {
      mounted = false;
      rendered?.unmount();
      rendered = undefined;
    },
  };
}
