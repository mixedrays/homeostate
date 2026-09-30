import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // Every playground links back here, so the port is fixed.
  server: { port: 5180, strictPort: true },
});
