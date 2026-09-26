import { defineConfig } from 'tsup';

// Library build. tsup leaves every `dependencies` and `peerDependencies`
// entry (and their subpaths) external, so Tiptap, React and KaTeX are
// imported by the consumer's bundler rather than copied into dist.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
