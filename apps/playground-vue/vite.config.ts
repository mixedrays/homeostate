import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // The hub (apps/playground) links here, so the port is fixed.
  server: { port: 5182, strictPort: true },
});
