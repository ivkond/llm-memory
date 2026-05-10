import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@ivkond-llm-wiki/common': fileURLToPath(new URL('../common/src/index.ts', import.meta.url)),
      '@ivkond-llm-wiki/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@ivkond-llm-wiki/infra': fileURLToPath(new URL('../infra/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
