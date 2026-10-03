import { MousePointer2 } from "lucide-react";
import type { Peer } from "../board/presence";

/**
 * Everyone else's pointer with their name. Pointers arrive a few times a second, so each
 * glides to its next spot instead of jumping.
 */
export function RemoteCursors({ peers }: { peers: readonly Peer[] }) {
  return peers.map(
    (peer) =>
      !peer.isLocal &&
      peer.pointer && (
        <div
          key={peer.clientId}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-20 transition-transform duration-75 ease-linear"
          style={{
            transform: `translate(${peer.pointer.x}px, ${peer.pointer.y}px)`,
          }}
        >
          <MousePointer2
            className="-mt-0.5 -ml-0.5 size-5 text-white drop-shadow-sm"
            fill={peer.color}
            strokeWidth={1.5}
          />
          <span
            className="absolute top-4 left-4 max-w-40 truncate rounded-sm rounded-tl-none px-1.5 text-[11px] leading-5 font-medium whitespace-nowrap text-white shadow-sm"
            style={{ backgroundColor: peer.color }}
          >
            {peer.name}
          </span>
        </div>
      ),
  );
}
