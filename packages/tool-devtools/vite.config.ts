import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const external = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
];

// Library build: the Tailwind stylesheet is compiled here and inlined into the bundle as a
// string, so apps get the devtools styles without a Tailwind setup of their own.
// `tsc -b` writes the declarations into the same `dist`.
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    emptyOutDir: false,
    sourcemap: true,
    rolldownOptions: {
      external: (id) =>
        external.some((name) => id === name || id.startsWith(`${name}/`)),
    },
  },
});
