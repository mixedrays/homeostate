import { sitemapXml } from "../content/llm.server.ts";
import { getManifest } from "../content/manifest.server.ts";
import { textResponse } from "../content/respond.server.ts";
import { siteUrl } from "../lib/site-url.ts";

export function loader() {
  return textResponse(
    sitemapXml(getManifest(), siteUrl),
    "application/xml; charset=utf-8",
  );
}
