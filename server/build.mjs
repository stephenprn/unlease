// Bundles the server and the shared packages into one ESM file.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

await build({
  entryPoints: [here('src/main.ts')],
  outfile: here('dist/server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // sharp loads a native addon for the running platform, so it stays in node_modules.
  external: ['sharp'],
  alias: { '@unlease/core': here('../packages/core/src'), '@unlease/design': here('../packages/design/src'), '@unlease/notes': here('../packages/notes/src') },
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
});
