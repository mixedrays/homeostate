import type { ReactNode } from "react";
import { Wifi } from "lucide-react";
import { cn } from "cn";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { Switch } from "../components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { useNetworkSnapshot } from "../lib/use-network-snapshot";
import type { NetworkLink } from "../network";
import { formatDelay } from "./format";

const LATENCIES = [0, 100, 500, 2000];
const JITTERS = [0, 50, 200, 1000];

export function NetworkTab({ network }: { network: NetworkLink | undefined }) {
  const snapshot = useNetworkSnapshot(network);

  if (!network || !snapshot) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wifi />
          </EmptyMedia>
          <EmptyTitle>No network link</EmptyTitle>
          <EmptyDescription>
            Put a <code>createNetworkLink</code> between the app&apos;s document
            and the one its provider syncs, and add it to the source as{" "}
            <code>network</code>, to slow down or cut this tab&apos;s
            connection.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { conditions, connected, incoming, outgoing } = snapshot;
  const status = conditions.offline
    ? "Offline"
    : connected
      ? "Connected"
      : "Down for a moment";

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <section
        aria-labelledby="devtools-conditions"
        className="space-y-3 border-b px-3 py-2"
      >
        <h3 id="devtools-conditions" className="text-xs font-medium">
          Conditions
        </h3>
        <Condition
          label="Offline"
          hint="Nothing passes either way. Coming back online exchanges the documents, so both sides merge what the other missed."
          control={
            <Switch
              size="sm"
              checked={conditions.offline}
              onCheckedChange={(offline: boolean) =>
                network.setConditions({ offline })
              }
              aria-label="Offline"
            />
          }
        />
        <Condition
          label="Latency"
          value={formatDelay(conditions.latency)}
          hint="Added to every update, either way."
        >
          <Presets
            label="Latency"
            values={LATENCIES}
            value={conditions.latency}
            onChange={(latency) => network.setConditions({ latency })}
          />
        </Condition>
        <Condition
          label="Jitter"
          value={formatDelay(conditions.jitter)}
          hint="Up to this much more per update, at random. Updates still arrive in order."
        >
          <Presets
            label="Jitter"
            values={JITTERS}
            value={conditions.jitter}
            onChange={(jitter) => network.setConditions({ jitter })}
          />
        </Condition>
        <Condition
          label="Flaky"
          hint="Drops the link for 1 to 3 seconds every 3 to 10 seconds."
          control={
            <Switch
              size="sm"
              checked={conditions.flaky}
              onCheckedChange={(flaky: boolean) =>
                network.setConditions({ flaky })
              }
              aria-label="Flaky"
            />
          }
        />
      </section>

      <section aria-labelledby="devtools-link" className="px-3 py-2">
        <h3 id="devtools-link" className="text-xs font-medium">
          Link
        </h3>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                connected ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {status}
          </dd>
          <dt className="text-muted-foreground">Incoming</dt>
          <dd className="font-mono tabular-nums">{incoming}</dd>
          <dt className="text-muted-foreground">Outgoing</dt>
          <dd className="font-mono tabular-nums">{outgoing}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          The link carries updates between this tab&apos;s document and the one
          its provider syncs; the counts are updates on their way. Presence,
          such as cursors, does not go through it. The engine switch in the
          header is different: it stops syncing the store with the document.
        </p>
      </section>
    </div>
  );
}

function Condition({
  label,
  value,
  hint,
  control,
  children,
}: {
  label: string;
  value?: string;
  hint: string;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">{label}</span>
        {value && (
          <span className="text-muted-foreground tabular-nums">{value}</span>
        )}
        {control && <span className="ml-auto flex">{control}</span>}
      </div>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Presets({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      value={[String(value)]}
      onValueChange={(next: string[]) => {
        if (next[0] !== undefined) onChange(Number(next[0]));
      }}
    >
      {values.map((option) => (
        <ToggleGroupItem
          key={option}
          value={String(option)}
          aria-label={`${label} ${formatDelay(option)}`}
        >
          {formatDelay(option)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
