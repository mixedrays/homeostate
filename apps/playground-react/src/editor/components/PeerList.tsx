import { useId } from "react";
import { cn } from "@/lib/utils";
import type { Peer } from "../presence";

interface PeerListProps {
  peers: readonly Peer[];
}

/** Everyone in the room, in their cursor colours, this tab first. */
export function PeerList({ peers }: PeerListProps) {
  const headingId = useId();
  const alone = peers.every((peer) => peer.isLocal);

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <h2 id={headingId} className="text-sm font-medium">
        Here now{" "}
        <span className="font-normal text-muted-foreground tabular-nums">
          {peers.length}
        </span>
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {peers.map((peer) => (
          <li
            key={peer.clientId}
            className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2 text-xs"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: peer.color }}
            />
            <span
              className={cn(
                "truncate",
                peer.anonymous && "text-muted-foreground italic",
              )}
            >
              {peer.name}
            </span>
            {peer.isLocal && (
              <span className="shrink-0 text-muted-foreground">(you)</span>
            )}
          </li>
        ))}
      </ul>
      {alone && (
        <p className="text-xs text-muted-foreground">
          Open this page in another tab to write together.
        </p>
      )}
    </section>
  );
}
