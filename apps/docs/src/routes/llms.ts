import type { LoaderFunctionArgs } from "react-router";
import { llmsTxt } from "../content/llm.server.ts";
import { getManifest } from "../content/manifest.server.ts";
import { requestPath, textResponse } from "../content/respond.server.ts";
import { siteUrl } from "../lib/site-url.ts";

// /llms.txt, and /docs/<pkg>/llms.txt for one package.
export function loader({ request }: LoaderFunctionArgs) {
  const pkg = /^\/docs\/([^/]+)\/llms\.txt$/.exec(requestPath(request))?.[1];
  return textResponse(
    llmsTxt(getManifest(), siteUrl, pkg),
    "text/plain; charset=utf-8",
  );
}
