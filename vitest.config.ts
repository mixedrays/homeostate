import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["{packages,apps}/*/src/__tests__/**/*.test.{ts,tsx}"],
  },
});
