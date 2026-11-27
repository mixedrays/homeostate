import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The hub (apps/playground) links here, so the port is fixed.
  server: { port: 5181, strictPort: true },
  // One MobX copy for the adapter and the store; two would hide each other's observables.
  resolve: { tsconfigPaths: true, dedupe: ["mobx"] },
});
