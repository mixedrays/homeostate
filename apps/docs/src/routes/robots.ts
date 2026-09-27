import { textResponse } from "../content/respond.server.ts";
import { siteUrl } from "../lib/site-url.ts";

export function loader() {
  return textResponse(
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
    "text/plain; charset=utf-8",
  );
}
