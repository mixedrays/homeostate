import path from "node:path";
import type { Plugin } from "vite";
import { guidesDir, packagesDir } from "../src/content/paths.server.ts";

// packages/<slug>/docs/**, packages/<slug>/CHANGELOG.md, packages/<slug>/package.json, content/**
function isContent(file: string): boolean {
  if (file.startsWith(guidesDir + path.sep)) return true;
  const rel = path.relative(packagesDir, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const [, entry] = rel.split(path.sep);
  return (
    entry === "docs" || entry === "CHANGELOG.md" || entry === "package.json"
  );
}

/**
 * Dev only. Loaders read the markdown with fs, so Vite doesn't know about it: an edit reloads
 * the page (the loaders then read the new text), and adding or removing a file restarts the
 * server so routes.ts regenerates the route list.
 */
export function docsDev(): Plugin {
  return {
    name: "homeostate:docs-dev",
    apply: "serve",
    configureServer(server) {
      server.watcher.add([packagesDir, guidesDir]);
      server.watcher.on("change", (file) => {
        if (isContent(file)) server.ws.send({ type: "full-reload" });
      });
      const restart = (file: string) => {
        if (isContent(file)) void server.restart();
      };
      server.watcher.on("add", restart);
      server.watcher.on("unlink", restart);
    },
  };
}
