import { useId, useState, type ReactNode } from "react";
import { RotateCcw, Wifi } from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { Input } from "../components/ui/input";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import type { Inspector, InspectorSnapshot } from "../inspector";
import { useNetworkSnapshot } from "../lib/use-network-snapshot";
import type { NetworkLink } from "../network";
import { HomeostateMark } from "./mark";

/** The sliders' ranges and steps, in milliseconds; the fields go past them. */
const LATENCY = { max: 2000, step: 50 };
const JITTER = { max: 1000, step: 25 };
/** The longest delay the fields take: a minute already stalls the link. */
const MAX_DELAY = 60_000;
/** Reads a slider's value out as `500 ms`. */
const DELAY_FORMAT: Intl.NumberFormatOptions = {
  style: "unit",
  unit: "millisecond",
  unitDisplay: "short",
};

export function NetworkTab({
  snapshot,
  inspector,
  network,
}: {
  snapshot: InspectorSnapshot;
  inspector: Inspector;
  network: NetworkLink | undefined;
}) {
  const link = useNetworkSnapshot(network);
  const top = (
    <>
      {snapshot.connected === false && (
        <Notice>
          Disconnected: changes stay in this store and peers do not see them.
          Reconnecting adopts the backend&apos;s values, so edits made meanwhile
          to keys it holds are dropped.
        </Notice>
      )}
      {link && !link.connected && (
        <Notice>
          {link.conditions.offline
            ? "Network offline"
            : "Network down for a moment"}
          : changes made here wait, and peers&apos; changes do not arrive.
          Coming back online merges both.
        </Notice>
      )}
      {snapshot.connected !== null && (
        <EngineSection connected={snapshot.connected} inspector={inspector} />
      )}
    </>
  );

  if (!network || !link) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {top}
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wifi />
            </EmptyMedia>
            <EmptyTitle>No network link</EmptyTitle>
            <EmptyDescription>
              Put a <code>createNetworkLink</code> between the app&apos;s
              document and the one its provider syncs, and add it to the source
              as <code>network</code>, to slow down or cut this tab&apos;s
              connection.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const { conditions, connected, incoming, outgoing } = link;
  const status = conditions.offline
    ? "Offline"
    : connected
      ? "Connected"
      : "Down for a moment";

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {top}
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
        <DelayCondition
          label="Latency"
          hint="Added to every update, either way."
          {...LATENCY}
          value={conditions.latency}
          onChange={(latency) => network.setConditions({ latency })}
        />
        <DelayCondition
          label="Jitter"
          hint="Up to this much more per update, at random. Updates still arrive in order."
          {...JITTER}
          value={conditions.jitter}
          onChange={(jitter) => network.setConditions({ jitter })}
        />
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
          such as cursors, does not go through it. The engine switch above is
          different: it stops syncing the store with the document.
        </p>
      </section>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
      {children}
    </p>
  );
}

function EngineSection({
  connected,
  inspector,
}: {
  connected: boolean;
  inspector: Inspector;
}) {
  return (
    <section
      aria-labelledby="devtools-engine"
      className="space-y-1.5 border-b px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <h3 id="devtools-engine" className="text-xs font-medium">
          Sync engine
        </h3>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <HomeostateMark
            state={connected ? "connected" : "disconnected"}
            className="size-3.5 shrink-0 [--hm-ink:currentColor]"
          />
          {connected ? "Connected" : "Disconnected"}
          <Switch
            size="sm"
            checked={connected}
            onCheckedChange={(checked: boolean) =>
              checked ? inspector.connect() : inspector.disconnect()
            }
            aria-label="Sync engine connected"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Syncs the store with the backend. While it is off, each side keeps its
        own changes.
      </p>
    </section>
  );
}

function Condition({
  label,
  labelId,
  hint,
  control,
  children,
}: {
  label: string;
  labelId?: string;
  hint: string;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span id={labelId} className="font-medium">
          {label}
        </span>
        {control && (
          <span className="ml-auto flex items-center gap-1">{control}</span>
        )}
      </div>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** A delay set with a stepped slider, or typed in milliseconds, past the slider's end too, with a button back to 0. */
function DelayCondition({
  label,
  hint,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  return (
    <Condition
      label={label}
      labelId={labelId}
      hint={hint}
      control={
        <>
          <DelayInput
            label={label}
            step={step}
            value={value}
            onChange={onChange}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Reset ${label.toLowerCase()}`}
            title="Reset to 0"
            disabled={value === 0}
            onClick={() => onChange(0)}
          >
            <RotateCcw />
          </Button>
        </>
      }
    >
      <Slider
        aria-labelledby={labelId}
        min={0}
        max={max}
        step={step}
        largeStep={step * 5}
        format={DELAY_FORMAT}
        value={[Math.min(value, max)]}
        onValueChange={(next) =>
          onChange(typeof next === "number" ? next : next[0])
        }
        className="py-1"
      />
    </Condition>
  );
}

/** Whole milliseconds from 0 to `MAX_DELAY`, or `undefined` for an empty or negative field. */
const parseDelay = (text: string): number | undefined => {
  if (text.trim() === "") return undefined;
  const ms = Number(text);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.min(Math.round(ms), MAX_DELAY);
};

/** Applies the delay as it is typed, and shows the one applied once the field is left. */
function DelayInput({
  label,
  step,
  value,
  onChange,
}: {
  label: string;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  // What is typed, until the field is left or Enter is pressed.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_DELAY}
        step={step}
        value={text}
        aria-label={`${label} in milliseconds`}
        aria-invalid={parseDelay(text) === undefined || undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = parseDelay(event.target.value);
          if (next !== undefined && next !== value) onChange(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") setDraft(null);
        }}
        onBlur={() => setDraft(null)}
        className="h-6 w-16 [appearance:textfield] rounded-md px-1.5 py-0 text-right text-xs text-foreground tabular-nums md:text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      ms
    </label>
  );
}
