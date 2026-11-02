import { useCallback, useSyncExternalStore } from "react";
import type { SyncEngine, SyncStatus } from "@homeostate/core";

/**
 * The status of the server's render and of hydration. It is not read from the engine, which may
 * differ between the server and the browser, so that hydration always matches what the server
 * sent. The engine's status follows right after hydration.
 */
const SERVER_STATUS: SyncStatus = Object.freeze({
  connected: false,
  ready: false,
  failure: null,
});

const getServerStatus = (): SyncStatus => SERVER_STATUS;

/**
 * Reads a sync engine's status in a React component, and re-renders it when the status changes.
 * Local and remote changes that leave the status as it was re-render nothing. Pass any
 * `SyncEngine`: the one `createSyncEngine` returns, Zustand's or Redux's `store.homeostate`, or
 * what `syncMobxStore` or `syncStateTree` return.
 *
 * The status describes the engine, not the network: the engine knows nothing of the provider.
 * `connected` means only that the engine is subscribed to the store and the backend, and it stays
 * true while the sync server is down. Without the `ready` option, `ready` says no more than
 * `connected`. Read the provider's own state to show whether the peer is online.
 *
 * @param engine - The sync engine to read
 * @returns The engine's status, or a disconnected one on the server and during hydration
 *
 * @example
 * ```tsx
 * import { useSyncStatus } from "@homeostate/react";
 *
 * function Editor() {
 *   const { ready, failure } = useSyncStatus(useTodoStore.homeostate);
 *   return (
 *     <>
 *       {failure && <p role="alert">Changes are not syncing.</p>}
 *       <textarea disabled={!ready} />
 *     </>
 *   );
 * }
 * ```
 */
export function useSyncStatus(
  engine: Pick<SyncEngine, "getStatus" | "subscribeStatus">,
): SyncStatus {
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribeStatus(listener),
    [engine],
  );
  const getStatus = useCallback(() => engine.getStatus(), [engine]);
  return useSyncExternalStore(subscribe, getStatus, getServerStatus);
}
