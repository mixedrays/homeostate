import type { Config } from "@react-router/dev/config";
import { postbuild } from "./scripts/postbuild.ts";

// Every route in src/routes.ts is static, so `prerender: true` renders the whole site: an HTML
// page and a .data file per docs page, and the raw body of every resource route (.md twins,
// llms.txt, sitemap.xml) at its exact path. `buildEnd` runs after prerendering.
export default {
  appDirectory: "src",
  ssr: false,
  prerender: true,
  async buildEnd({ viteConfig }) {
    await postbuild(`${viteConfig.root}/build/client`);
  },
} satisfies Config;
