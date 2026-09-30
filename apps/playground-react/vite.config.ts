import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `dedupe: ['mobx']` keeps the adapter and the store on one MobX copy; two copies make
  // observables from one invisible to reactions from the other.
  // The hub (apps/playground) links here, so the port is fixed.
  server: { port: 5181, strictPort: true },
  resolve: { tsconfigPaths: true, dedupe: ["mobx"] },
});
