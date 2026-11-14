import { useCallback, useSyncExternalStore } from "react";
import type { SyncEngine, SyncStatus } from "@homeostate/core";

/**
 * The status of the server's render and of hydration. It is not read from the engine, which may
 * differ between the server and the browser, so that hydration always matches what the server
 * sent. The engine's status follows right after hydration.
 */
const SERVER_STATUS: SyncStatus = Object.freeze({
  connected: false,
  failure: null,
});

const getServerStatus = (): SyncStatus => SERVER_STATUS;

/**
 * Reads a sync engine's status in a React component, and re-renders it when the status changes.
 * It reads the status again on every sync event, and local and remote changes that leave the
 * status as it was re-render nothing, since `getStatus()` returns the same object. Pass any
 * `SyncEngine`: the one `createSyncEngine` returns, Zustand's or Redux's `store.homeostate`, or
 * what `syncMobxStore` or `syncStateTree` return.
 *
 * The status describes the engine, not the network: the engine knows nothing of the provider.
 * `connected` means only that the engine is done reconciling and subscribed to the store and the
 * backend, and it stays true while the sync server is down. Read the provider's own state to show
 * whether the peer is online.
 *
 * @param engine - The sync engine to read
 * @returns The engine's status, or a disconnected one on the server and during hydration
 *
 * @example
 * ```tsx
 * import { useSyncStatus } from "@homeostate/react";
 *
 * function Editor() {
 *   const { connected, failure } = useSyncStatus(useTodoStore.homeostate);
 *   return (
 *     <>
 *       {failure && <p role="alert">Changes are not syncing.</p>}
 *       <textarea disabled={!connected} />
 *     </>
 *   );
 * }
 * ```
 */
export function useSyncStatus(
  engine: Pick<SyncEngine, "getStatus" | "subscribe">,
): SyncStatus {
  // Every change of the status comes with a sync event; the event itself is not needed.
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribe(() => listener()),
    [engine],
  );
  const getStatus = useCallback(() => engine.getStatus(), [engine]);
  return useSyncExternalStore(subscribe, getStatus, getServerStatus);
}
