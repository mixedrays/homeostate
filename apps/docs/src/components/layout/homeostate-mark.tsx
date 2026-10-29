import { useEffect, useRef } from "react";
import { cn } from "cn";

const diamond = (
  <rect
    x="37"
    y="37"
    width="22"
    height="22"
    rx="6"
    transform="rotate(45 48 48)"
  />
);

/**
 * The homeostate mark, inline so its parts can move: two brackets, one per synced store,
 * joined into an H by the shared state diamond. Its motion lives in app.css.
 *
 * Without `state`, hovering or focusing the closest link plays the Connect motion once: the
 * brackets meet, the crossbar joins them, the diamond grows and a ripple spreads. With
 * `state`, it is a connection icon: "disconnected" shows only the brackets, and a change
 * plays the same sequence forward or back.
 */
export function HomeostateMark({
  className,
  state,
}: {
  className?: string;
  state?: "connected" | "disconnected";
}) {
  const ref = useRef<SVGSVGElement>(null);
  const toggle = state !== undefined;

  useEffect(() => {
    const mark = ref.current;
    return mark && !toggle ? playOnHover(mark) : undefined;
  }, [toggle]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 96 96"
      fill="none"
      strokeWidth={10}
      aria-hidden
      data-state={state}
      className={cn("hm-mark", className)}
    >
      <path
        className="hm-left"
        strokeLinecap="round"
        d="M34 18H32C21 18 18 25 18 36V60C18 71 21 78 32 78H34"
      />
      <path
        className="hm-right"
        strokeLinecap="round"
        d="M62 18H64C75 18 78 25 78 36V60C78 71 75 78 64 78H62"
      />
      <path className="hm-bar" pathLength={100} d="M18 48H78" />
      <g className="hm-ripple" strokeWidth={4}>
        {diamond}
      </g>
      <g className="hm-diamond" stroke="none">
        {diamond}
      </g>
    </svg>
  );
}

/**
 * Plays the motion when the closest link or button, or the mark itself, is hovered or
 * focused. `data-playing` stays on until the motion ends, so it runs to the end even if the
 * pointer leaves early.
 */
function playOnHover(mark: SVGSVGElement): () => void {
  const trigger = mark.closest("a, button") ?? mark;
  const play = (): void => {
    if (mark.hasAttribute("data-playing")) return;
    mark.setAttribute("data-playing", "");
    // Environments without the Web Animations API, such as jsdom, have nothing to wait for.
    const running = mark.getAnimations?.({ subtree: true }) ?? [];
    Promise.allSettled(running.map((animation) => animation.finished)).then(
      () => mark.removeAttribute("data-playing"),
    );
  };
  trigger.addEventListener("pointerenter", play);
  trigger.addEventListener("focus", play);
  return () => {
    trigger.removeEventListener("pointerenter", play);
    trigger.removeEventListener("focus", play);
  };
}
