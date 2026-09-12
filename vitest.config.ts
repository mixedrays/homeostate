import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['packages/*/src/__tests__/**/*.test.ts'],
  },
});
