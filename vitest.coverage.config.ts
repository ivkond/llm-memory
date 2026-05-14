import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'packages/infra', 'packages/common', 'packages/mcp-server', 'packages/cli'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      all: true,
      include: ['packages/core/src/**/*.ts', 'packages/infra/src/**/*.ts', 'packages/common/src/**/*.ts', 'packages/mcp-server/src/**/*.ts', 'packages/cli/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/tests/**',
        '**/dist/**',
        '**/coverage/**',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/*.config.*',
      ],
      thresholds: {
        global: {
          statements: 85,
          branches: 88,
          functions: 93,
          lines: 85,
        },
      },
    },
  },
});
