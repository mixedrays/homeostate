import { PauseIcon, PlayIcon } from "lucide-react";

/**
 * Pauses or plays a looping animation (WCAG 2.2.2). Hidden for reduced motion, which gets no
 * motion to pause.
 */
export function PauseButton({
  paused,
  onToggle,
  what,
}: {
  paused: boolean;
  onToggle: () => void;
  /** Named in the label: "Pause demo", "Play demo". */
  what: string;
}) {
  const label = `${paused ? "Play" : "Pause"} ${what}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="grid size-6.5 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:hidden"
    >
      {paused ? (
        <PlayIcon aria-hidden="true" className="size-3" />
      ) : (
        <PauseIcon aria-hidden="true" className="size-3" />
      )}
    </button>
  );
}
