import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // The hub (apps/playground) links here, so the port is fixed.
  server: { port: 5183, strictPort: true },
});
