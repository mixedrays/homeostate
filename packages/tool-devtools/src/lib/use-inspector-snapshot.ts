import { useSyncExternalStore } from "react";
import type { Inspector, InspectorSnapshot } from "../inspector";

/** The inspector's snapshot, kept current. */
export function useInspectorSnapshot(inspector: Inspector): InspectorSnapshot {
  return useSyncExternalStore(inspector.subscribe, inspector.getSnapshot);
}
