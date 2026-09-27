import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { TocEntry } from "@/content/types.ts";

/** The heading scrolled past the sticky header most recently. */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | undefined>();

  useEffect(() => {
    if (ids.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | undefined;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 96) current = id;
      }
      setActive(current ?? ids[0]);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  return active;
}

function TocList({ toc, active }: { toc: TocEntry[]; active?: string }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {toc.map((entry) => (
        <li key={entry.id} className={cn(entry.depth === 3 && "pl-3")}>
          <a
            href={`#${entry.id}`}
            className={cn(
              "block py-0.5 text-muted-foreground transition-colors hover:text-foreground",
              active === entry.id && "font-medium text-foreground",
            )}
          >
            {entry.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Toc({ toc }: { toc: TocEntry[] }) {
  const ids = useMemo(() => toc.map((entry) => entry.id), [toc]);
  const active = useActiveHeading(ids);
  if (toc.length === 0) return null;
  return (
    <nav aria-label="On this page">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground/80 uppercase">
        On this page
      </h2>
      <TocList toc={toc} active={active} />
    </nav>
  );
}

/** Below xl the rail is hidden; the same list collapses at the top of the article. */
export function MobileToc({ toc }: { toc: TocEntry[] }) {
  if (toc.length === 0) return null;
  return (
    <Collapsible className="mb-8 rounded-lg border px-3 py-2 xl:hidden">
      <CollapsibleTrigger className="group/trigger flex w-full items-center justify-between text-sm font-medium">
        On this page
        <ChevronDownIcon className="size-4 transition-transform group-data-panel-open/trigger:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <TocList toc={toc} />
      </CollapsibleContent>
    </Collapsible>
  );
}
