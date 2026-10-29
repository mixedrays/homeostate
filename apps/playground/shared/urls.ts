/**
 * Points a `localhost` URL at the host this page was loaded from, so another device that opens
 * the playgrounds over the network (`pnpm playground --host`) reaches the dev and sync servers
 * on the machine running them rather than its own. Other URLs, relative paths and callers
 * outside a browser get the URL back unchanged.
 */
export function onPageHost(url: string): string {
  if (typeof location === "undefined" || !URL.canParse(url)) return url;
  const target = new URL(url);
  if (target.hostname !== "localhost") return url;
  target.hostname = location.hostname;
  return target.href;
}
