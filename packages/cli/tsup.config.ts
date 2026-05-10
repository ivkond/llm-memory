import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/commands/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: true,
  clean: true,
  shims: false,
  skipNodeModulesBundle: true,
  noExternal: [/^@ivkond-llm-wiki\/(core|infra|common)$/],
});
