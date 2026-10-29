/** The shared packages' tests. Each program runs its own (web/notes and server with Vitest, mobile/notes with Jest). */
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const alias = ['core', 'design', 'notes'].map(name => ({ find: `@unlease/${name}`, replacement: fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url)) }));

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['packages/*/src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['vitest.setup.ts'],
  },
});
