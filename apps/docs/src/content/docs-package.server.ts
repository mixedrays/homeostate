import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./paths.server.ts";

/** The docs app's own name and version, from apps/docs/package.json. */
export function docsPackage(): { name: string; version: string } {
  const file = path.join(repoRoot, "apps/docs/package.json");
  const { name, version } = JSON.parse(readFileSync(file, "utf8")) as {
    name: string;
    version: string;
  };
  return { name, version };
}
