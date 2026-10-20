// Bundles operational scripts into self-contained files for the production image (no tsx/TypeScript at runtime).
import { build } from 'esbuild';

await build({
  entryPoints: { migrate: 'scripts/migrate.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
