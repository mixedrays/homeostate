const DIAMOND =
  '<rect x="37" y="37" width="22" height="22" rx="6" transform="rotate(45 48 48)"/>';

/**
 * The homeostate mark with named parts, inline so they can move. Its colors and the Connect
 * motion live in homeostate-mark.css, which each app imports once; the presentation
 * attributes keep it drawn without that stylesheet.
 */
const MARK_SVG =
  '<svg class="hm-mark" viewBox="0 0 96 96" fill="none" stroke="#203A40" stroke-width="10" aria-hidden="true">' +
  '<path class="hm-left" stroke-linecap="round" d="M34 18H32C21 18 18 25 18 36V60C18 71 21 78 32 78H34"/>' +
  '<path class="hm-right" stroke-linecap="round" d="M62 18H64C75 18 78 25 78 36V60C78 71 75 78 64 78H62"/>' +
  '<path class="hm-bar" pathLength="100" d="M18 48H78"/>' +
  `<g class="hm-ripple" stroke="#2563EB" stroke-width="4" opacity="0">${DIAMOND}</g>` +
  `<g class="hm-diamond" fill="#2563EB" stroke="none">${DIAMOND}</g>` +
  "</svg>";

/**
 * Renders the mark into `host`, and plays the Connect motion when `trigger` is hovered or
 * focused: the brackets meet, the crossbar joins them, the diamond grows where they meet and
 * a ripple spreads. The trigger defaults to the closest link or button around `host`, or
 * `host` itself. The motion runs to the end even if the pointer leaves early.
 *
 * Returns a function that removes the mark and its listeners.
 */
export function mountHomeostateMark(
  host: Element,
  trigger: Element = host.closest("a, button") ?? host,
): () => void {
  host.innerHTML = MARK_SVG;
  const mark = host.firstElementChild ?? host;

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
    host.replaceChildren();
  };
}
