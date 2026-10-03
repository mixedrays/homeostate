import { cn } from "cn";

/**
 * The homeostate mark: two brackets, one per synced store, joined into an H by the shared
 * state diamond. Ink on cobalt in light mode, paper on sky in dark mode.
 */
export function HomeostateMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden
      className={cn("fill-none stroke-10", className)}
    >
      <g className="stroke-[#203A40] dark:stroke-[#F8FAFC]">
        <path
          d="M34 18H32C21 18 18 25 18 36V60C18 71 21 78 32 78H34M62 18H64C75 18 78 25 78 36V60C78 71 75 78 64 78H62"
          strokeLinecap="round"
        />
        <path d="M18 48H78" />
      </g>
      <rect
        x="37"
        y="37"
        width="22"
        height="22"
        rx="6"
        transform="rotate(45 48 48)"
        className="fill-[#2563EB] stroke-none dark:fill-[#60A5FA]"
      />
    </svg>
  );
}
