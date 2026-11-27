/**
 * Points a `localhost` URL at this page's host, so a device opening the playgrounds over the
 * network (`pnpm playground --host`) reaches the servers on the machine running them. Anything
 * else, or outside a browser, comes back unchanged.
 */
export function onPageHost(url: string): string {
  if (typeof location === "undefined" || !URL.canParse(url)) return url;
  const target = new URL(url);
  if (target.hostname !== "localhost") return url;
  target.hostname = location.hostname;
  return target.href;
}
