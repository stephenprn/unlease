import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: ['core', 'design', 'notes'].map(name => ({ find: `@unlease/${name}`, replacement: fileURLToPath(new URL(`../packages/${name}/src`, import.meta.url)) })),
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    testTimeout: 20_000,
  },
});
