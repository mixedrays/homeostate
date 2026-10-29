import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  // 5180-5184 belong to the playgrounds, which `pnpm dev` starts alongside.
  server: { port: 5191 },
});
