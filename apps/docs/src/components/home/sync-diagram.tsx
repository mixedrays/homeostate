import { cn } from "cn";
import { DatabaseIcon, LayersIcon, type LucideIcon } from "lucide-react";
import { HomeostateMark } from "@/components/layout/homeostate-mark.tsx";

const orList = new Intl.ListFormat("en", { type: "disjunction" });

/**
 * How a store, Homeostate and a CRDT document connect: vertical on small screens, horizontal from
 * `lg`. A CSS loop in app.css sends a local change out through the links, then a remote one back.
 */
export function SyncDiagram({ backends }: { backends: string[] }) {
  return (
    <figure className="hc-diagram relative overflow-hidden rounded-2xl border bg-muted/30 p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[18px_18px] mask-[linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative">
        <div className="mb-7 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            How it connects
          </span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            Two-way sync
          </span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center">
          <Endpoint
            icon={LayersIcon}
            title="Your existing store"
            detail="Same state. Same actions. Same UI."
            glow="hc-glow-store"
          />
          <DiagramLink label="store adapter" packet="hc-packet-store" />
          <div className="flex items-center gap-4 rounded-xl border border-primary/30 bg-background p-5 shadow-[0_4px_24px_-8px_var(--primary)] lg:flex-1">
            <HomeostateMark
              state="connected"
              className="hc-mark size-7 shrink-0"
            />
            <div>
              <p className="font-semibold tracking-tight">Homeostate</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The sync engine between them.
              </p>
            </div>
          </div>
          <DiagramLink label="CRDT backend" packet="hc-packet-crdt" />
          <Endpoint
            icon={DatabaseIcon}
            title="Your CRDT document"
            detail={orList.format(backends)}
            glow="hc-glow-crdt"
          />
        </div>
        <figcaption className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          <span className="hc-caption-out">Local changes flow out.</span>{" "}
          <span className="hc-caption-in">Remote changes flow in.</span>
        </figcaption>
      </div>
    </figure>
  );
}

function Endpoint({
  icon: Icon,
  title,
  detail,
  glow,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  glow: string;
}) {
  return (
    <div className="relative flex items-center gap-4 rounded-xl border bg-background p-4 shadow-xs lg:flex-1">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -inset-px rounded-xl",
          glow,
        )}
      />
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** The wire between two cards, named after the package that bridges them. */
function DiagramLink({ label, packet }: { label: string; packet: string }) {
  return (
    <div className="relative h-16 shrink-0 lg:h-auto lg:w-32 lg:self-stretch">
      <span
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-l-2 border-primary/40 lg:top-1/2 lg:right-0 lg:bottom-auto lg:left-0 lg:translate-x-0 lg:-translate-y-1/2 lg:border-t-2 lg:border-l-0"
      />
      {/* A zero-width track (zero-height from `lg`), so one keyframe set moves the packet along
          either axis by animating both `top` and `left` from 0 to 100%. */}
      <span
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-1/2 w-0 lg:top-1/2 lg:right-0 lg:bottom-auto lg:left-0 lg:h-0 lg:w-auto"
      >
        <span className={cn("sd-packet opacity-0", packet)} />
      </span>
      <span className="absolute top-1/2 left-1/2 ml-4 -translate-y-1/2 font-mono text-[11px] whitespace-nowrap text-muted-foreground lg:top-auto lg:bottom-1/2 lg:mb-2.5 lg:ml-0 lg:-translate-x-1/2 lg:translate-y-0">
        {label}
      </span>
    </div>
  );
}
