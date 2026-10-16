import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    include: [
      'test/cli/**/*.test.ts',
      'test/scenarios/**/*.test.ts',
      'test/mocks/**/*.test.ts',
      'test/unit/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
    ],
  },
});
