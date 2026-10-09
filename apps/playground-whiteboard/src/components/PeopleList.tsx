import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { initials, type Peer } from "../board/presence";

/** Avatars shown before the rest fold into a count. */
const SHOWN = 4;

interface PeopleListProps {
  peers: readonly Peer[];
  onRename: () => void;
}

/** Everyone else on the board as avatars in their cursor colours, then this tab's name. */
export function PeopleList({ peers, onRename }: PeopleListProps) {
  const me = peers.find((peer) => peer.isLocal);
  const others = peers.filter((peer) => !peer.isLocal);
  const hidden = others.length - SHOWN;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {others.length > 0 && (
        <ul
          aria-label={`${others.length} other ${others.length === 1 ? "person" : "people"} on the board`}
          className="flex -space-x-1.5"
        >
          {others.slice(0, SHOWN).map((peer) => (
            <li key={peer.clientId}>
              <Tooltip>
                <TooltipTrigger
                  render={<span />}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-background",
                    peer.anonymous && "italic",
                  )}
                  style={{ backgroundColor: peer.color }}
                >
                  <span aria-hidden>{initials(peer.name)}</span>
                  <span className="sr-only">{peer.name}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom">{peer.name}</TooltipContent>
              </Tooltip>
            </li>
          ))}
          {hidden > 0 && (
            <li className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-background">
              +{hidden}
            </li>
          )}
        </ul>
      )}
      {me && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRename}
          aria-label={`You are ${me.name}. Change your name`}
          className="max-w-44"
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: me.color }}
          />
          <span
            className={cn(
              "truncate max-sm:hidden",
              me.anonymous && "text-muted-foreground italic",
            )}
          >
            {me.name}
          </span>
          <Pencil aria-hidden />
        </Button>
      )}
    </div>
  );
}
