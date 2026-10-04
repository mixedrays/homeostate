import { useSyncExternalStore } from "react";
import type { NetworkLink, NetworkSnapshot } from "../network";

const subscribeToNothing = (): (() => void) => () => {};
const nothing = (): null => null;

/** The link's snapshot, kept current, or `null` without a link. */
export function useNetworkSnapshot(
  network: NetworkLink | undefined,
): NetworkSnapshot | null {
  return useSyncExternalStore(
    network?.subscribe ?? subscribeToNothing,
    network?.getSnapshot ?? nothing,
  );
}
