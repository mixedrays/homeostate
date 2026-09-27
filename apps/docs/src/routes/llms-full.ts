import type { LoaderFunctionArgs } from "react-router";
import { llmsFullTxt } from "../content/llm.server.ts";
import { getManifest } from "../content/manifest.server.ts";
import { requestPath, textResponse } from "../content/respond.server.ts";
import { siteUrl } from "../lib/site-url.ts";

// /llms-full.txt, and /docs/<pkg>/llms-full.txt for one package.
export function loader({ request }: LoaderFunctionArgs) {
  const pkg = /^\/docs\/([^/]+)\/llms-full\.txt$/.exec(
    requestPath(request),
  )?.[1];
  return textResponse(
    llmsFullTxt(getManifest(), siteUrl, pkg),
    "text/plain; charset=utf-8",
  );
}
