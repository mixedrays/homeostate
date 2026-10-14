import type { InspectorSnapshot } from "../inspector";
import type { NetworkSnapshot } from "../network";
import { conditionsActive } from "./format";

/** A source's sync at a glance, for the status bar and the floating button. */
export interface SyncHealth {
  /** `null` without an engine. */
  engine: "connected" | "disconnected" | null;
  /** `null` without a network link. `conditions`: online, with conditions set. */
  link: "online" | "conditions" | "down" | "offline" | null;
  /** Keys the backend holds another value for. */
  diverged: number;
}

export const healthOf = (
  snapshot: InspectorSnapshot,
  link: NetworkSnapshot | null,
): SyncHealth => ({
  engine:
    snapshot.connected === null
      ? null
      : snapshot.connected
        ? "connected"
        : "disconnected",
  link: !link
    ? null
    : link.conditions.offline
      ? "offline"
      : !link.connected
        ? "down"
        : conditionsActive(link)
          ? "conditions"
          : "online",
  diverged: Object.values(snapshot.keyStatus).filter(
    (status) => status === "diverged",
  ).length,
});

export const linkLabel: Record<NonNullable<SyncHealth["link"]>, string> = {
  online: "Online",
  conditions: "Conditions on",
  down: "Link down",
  offline: "Offline",
};

/** What needs a look, such as `["disconnected", "Offline"]`; empty when all is well. */
export const issuesOf = ({ engine, link, diverged }: SyncHealth): string[] => [
  ...(engine === "disconnected" ? ["disconnected"] : []),
  ...(link && link !== "online" ? [linkLabel[link]] : []),
  ...(diverged > 0 ? [`${diverged} diverged`] : []),
];
