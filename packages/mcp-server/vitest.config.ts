import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@ivkond-llm-wiki/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@ivkond-llm-wiki/infra': path.resolve(__dirname, '../infra/src/index.ts'),
      '@ivkond-llm-wiki/common': path.resolve(__dirname, '../common/src/index.ts'),
    },
  },
});
