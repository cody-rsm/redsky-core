// Bundles operational scripts into self-contained files for the production image (no tsx/TypeScript at runtime).
import { build } from 'esbuild';

await build({
  entryPoints: { migrate: 'scripts/migrate.ts', 'rotate-encryption-key': 'scripts/rotate-encryption-key.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  // Next's server-only guard throws outside the React server runtime; the scripts share server modules with the app.
  alias: { 'server-only': './tests/stubs/server-only.ts' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
