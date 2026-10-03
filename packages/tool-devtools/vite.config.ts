import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const external = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
];

const isExternal = (names: string[]) => (id: string) =>
  names.some((name) => id === name || id.startsWith(`${name}/`));

// Library builds: the Tailwind stylesheet is compiled here and inlined into the bundle as a
// string, so apps get the devtools styles without a Tailwind setup of their own.
// `tsc -b` writes the declarations into the same `dist`.
//
// `vite build` builds the React component, leaving React and the other dependencies to the
// app. `vite build --mode mount` builds the `/mount` entry for apps without React: it bundles
// React and everything else but core into a chunk that `mountDevtools` loads on demand.
export default defineConfig(({ mode }) =>
  mode === "mount"
    ? {
        plugins: [tailwindcss()],
        // React reads this to pick its build; bundled, nothing else would set it.
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        build: {
          lib: { entry: "src/mount.ts", formats: ["es"], fileName: "mount" },
          emptyOutDir: false,
          sourcemap: true,
          rolldownOptions: {
            external: isExternal(["@homeostate/core"]),
            output: {
              // Fixed names, so rebuilding into a kept `dist` replaces the chunk.
              chunkFileNames: "mount-[name].js",
              // Whitespace too, which Vite keeps in ES libraries for tree-shaking; this
              // chunk is loaded whole.
              minify: true,
            },
          },
        },
      }
    : {
        plugins: [tailwindcss()],
        build: {
          lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
          emptyOutDir: false,
          sourcemap: true,
          rolldownOptions: { external: isExternal(external) },
        },
      },
);
