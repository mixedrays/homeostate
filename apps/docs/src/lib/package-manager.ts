import { createLocalStore } from "./local-store.ts";

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** The install tab chosen on any page applies to every install block, on every page. */
export const packageManagerStore = createLocalStore<PackageManager>(
  "docs:package-manager",
  "npm",
  PACKAGE_MANAGERS,
);
