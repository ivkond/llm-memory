import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core',
  'packages/infra',
  'packages/common',
  'packages/mcp-server',
  'packages/cli',
]);
