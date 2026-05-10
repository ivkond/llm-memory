import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: true,
  clean: true,
  shims: false,
  skipNodeModulesBundle: true,
  noExternal: [/^@llm-wiki\/(core|infra|common)$/],
});
