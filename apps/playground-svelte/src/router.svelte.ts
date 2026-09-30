/** The path the app is served under, without its trailing slash. */
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function readPath() {
  const path = location.pathname.slice(base.length).replace(/\/+$/, "");
  return path || "/";
}

/** The current route, as a path relative to the app's base. */
export const route = $state({ path: readPath() });

window.addEventListener("popstate", () => {
  route.path = readPath();
});

/** The `href` of a route, for links the browser can also open in a new tab. */
export function href(path: string) {
  return base + path;
}

export function navigate(path: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", href(path));
  else history.pushState(null, "", href(path));
  route.path = readPath();
  if (!replace) window.scrollTo(0, 0);
}

/** A click handler for links to routes: navigates in place unless the click asks for a new tab. */
export function followLink(
  event: MouseEvent & { currentTarget: HTMLAnchorElement },
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
    return;
  event.preventDefault();
  navigate(event.currentTarget.pathname.slice(base.length) || "/");
}
