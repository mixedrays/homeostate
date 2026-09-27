import { existsSync } from "node:fs";
import path from "node:path";

// The content code runs from apps/docs (dev, build, prerender) and from the repo root (vitest),
// and the prerender step runs it from a bundle in build/server, so `import.meta.url` can't anchor
// it. The workspace root is the nearest directory with pnpm-workspace.yaml.
function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No pnpm-workspace.yaml above ${start}`);
    }
    dir = parent;
  }
}

export const repoRoot = findRepoRoot(process.cwd());
export const packagesDir = path.join(repoRoot, "packages");
export const guidesDir = path.join(repoRoot, "apps/docs/content");

export function toRepoPath(file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}
