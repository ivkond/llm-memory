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
      '@llm-wiki/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@llm-wiki/infra': path.resolve(__dirname, '../infra/src/index.ts'),
      '@llm-wiki/common': path.resolve(__dirname, '../common/src/index.ts'),
    },
  },
});
