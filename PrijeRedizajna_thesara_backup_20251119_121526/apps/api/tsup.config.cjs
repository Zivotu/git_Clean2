const { defineConfig } = require('tsup');

module.exports = defineConfig({
  entry: ['src/index.ts', 'src/lib/dependencies.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: false,
  shims: true,
});