import { readFileSync } from "node:fs";
import path from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { getManifest } from "../content/manifest.server.ts";
import { notFound, requestPath } from "../content/respond.server.ts";

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

// Images from a docs assets/ folder, served at /docs/<pkg>/assets/<file>.
export function loader({ request }: LoaderFunctionArgs) {
  const asset = getManifest().assets.find(
    (a) => a.path === requestPath(request),
  );
  if (!asset) notFound();
  const type =
    TYPES[path.extname(asset.file).toLowerCase()] ?? "application/octet-stream";
  return new Response(readFileSync(asset.file), {
    headers: { "Content-Type": type },
  });
}
