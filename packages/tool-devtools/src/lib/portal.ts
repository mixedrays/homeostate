import { createContext, useContext } from "react";

/**
 * The element inside the devtools' shadow root that popups portal into. Portaled to
 * `document.body`, they would render outside the shadow root and lose its styles.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export const usePortalContainer = (): HTMLElement | null =>
  useContext(PortalContainerContext);
