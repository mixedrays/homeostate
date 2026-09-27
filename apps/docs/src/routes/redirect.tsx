import { redirect, type LoaderFunctionArgs } from "react-router";
import { getManifest } from "../content/manifest.server.ts";
import { notFound, requestPath } from "../content/respond.server.ts";

// /docs and /docs/<pkg>. Cloudflare answers these from _redirects; this route makes them work
// in dev and prerenders a meta-refresh page as a fallback. It needs a default export: prerender
// accepts a redirect only from a document route, not from a resource route.
export function loader({ request }: LoaderFunctionArgs) {
  const from = requestPath(request);
  const target = getManifest().redirects.find((r) => r.from === from);
  if (!target) notFound();
  throw redirect(target.to, 301);
}

export default function Redirect() {
  return null;
}
