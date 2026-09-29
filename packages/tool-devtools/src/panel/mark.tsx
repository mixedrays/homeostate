import { cn } from "cn";

/** The homeostate mark: two linked rings, one per side of the sync. */
export function HomeostateMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("fill-none stroke-[2.5]", className)}
    >
      <circle cx="11" cy="16" r="5" className="stroke-current" />
      <circle
        cx="21"
        cy="16"
        r="5"
        className="stroke-sky-500 dark:stroke-sky-300"
      />
    </svg>
  );
}
