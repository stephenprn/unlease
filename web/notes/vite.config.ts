import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { carnetPlugin } from './build/carnetPlugin.ts';
import { packageAliases, PACKAGES } from './build/packages.ts';

const web = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), carnetPlugin()],
  resolve: { alias: packageAliases },
  server: { fs: { allow: [web, PACKAGES] } },
  build: { target: 'es2023' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    testTimeout: 15_000,
  },
});
