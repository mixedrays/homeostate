import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { docsDev } from "./scripts/docs-dev.ts";

const DEV_ORIGIN = "http://localhost:5190";

// Absolute URLs (canonical, .md links, llms.txt, sitemap) use SITE_URL; the deploy workflow sets
// it, and postbuild warns when a build falls back to the dev origin.
const siteUrl = process.env.SITE_URL?.replace(/\/+$/, "") || DEV_ORIGIN;

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), docsDev()],
  resolve: { tsconfigPaths: true },
  define: { "import.meta.env.SITE_URL": JSON.stringify(siteUrl) },
  server: { port: 5190 },
});
