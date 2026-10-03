import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The hub (apps/playground) links here, so the port is fixed.
  server: { port: 5184, strictPort: true },
  resolve: { tsconfigPaths: true },
});
