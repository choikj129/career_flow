import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    setupFiles: ['tests/helpers/data-dir-setup.ts', 'tests/helpers/tmp-setup.ts'],
    testTimeout: 30_000,
  },
});
