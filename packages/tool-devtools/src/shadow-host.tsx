import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { PortalContainerContext } from "./lib/portal";
import { devtoolsCss, devtoolsPropertiesCss } from "./styles";

export type DevtoolsTheme = "system" | "light" | "dark";

const PROPERTIES_ID = "homeostate-devtools-properties";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const hoistProperties = (): void => {
  if (!devtoolsPropertiesCss || document.getElementById(PROPERTIES_ID)) return;
  const style = document.createElement("style");
  style.id = PROPERTIES_ID;
  style.textContent = devtoolsPropertiesCss;
  document.head.append(style);
};

const subscribeToScheme = (onChange: () => void): (() => void) => {
  const query = window.matchMedia?.(DARK_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
};

const prefersDark = (): boolean =>
  window.matchMedia?.(DARK_QUERY).matches ?? false;

/**
 * Renders its children into a shadow root on `document.body`, with the devtools stylesheet.
 * Mounting on the body keeps the fixed-position UI clear of a transformed or clipped
 * ancestor where the component happens to be rendered.
 */
export function ShadowHost({
  theme,
  children,
}: {
  theme: DevtoolsTheme;
  children: ReactNode;
}) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const systemDark = useSyncExternalStore(
    subscribeToScheme,
    prefersDark,
    () => false,
  );
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    hoistProperties();
    const host = document.createElement("div");
    host.setAttribute("data-homeostate-devtools", "");
    document.body.append(host);
    setShadow(host.attachShadow({ mode: "open" }));
    return () => {
      host.remove();
      setShadow(null);
    };
  }, []);

  if (!shadow) return null;

  return createPortal(
    <>
      <style>{devtoolsCss}</style>
      <div
        ref={setContainer}
        data-devtools-root=""
        // One stacking context above the page; inside it the panel sits under its popups.
        className={cn("relative isolate z-[2147483000]", dark && "dark")}
      >
        <PortalContainerContext.Provider value={container}>
          {children}
        </PortalContainerContext.Provider>
      </div>
    </>,
    shadow,
  );
}
