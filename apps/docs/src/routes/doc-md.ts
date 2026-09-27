import type { LoaderFunctionArgs } from "react-router";
import { servedMarkdownOrThrow } from "../content/llm.server.ts";
import { getManifest } from "../content/manifest.server.ts";
import {
  notFound,
  requestPath,
  textResponse,
} from "../content/respond.server.ts";
import { siteUrl } from "../lib/site-url.ts";

export function loader({ request }: LoaderFunctionArgs) {
  const manifest = getManifest();
  const page = manifest.byPath.get(requestPath(request).replace(/\.md$/, ""));
  if (!page) notFound();
  return textResponse(
    servedMarkdownOrThrow(page, manifest, siteUrl),
    "text/markdown; charset=utf-8",
  );
}
