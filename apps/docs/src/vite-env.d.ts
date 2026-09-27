/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute site origin without a trailing slash; see vite.config.ts. */
  readonly SITE_URL: string;
}
