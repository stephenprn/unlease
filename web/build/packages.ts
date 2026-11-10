/**
 * The names the code imports by, as tsconfig.app.json has them: the shared packages at the repository
 * root, and the web's own areas: the shell every app shares (`@shared/*`), each app (`@notes/*`,
 * `@pages/*`, `@contacts/*`, `@calendar/*`), the demo (`@demo/*`) and the tests' helpers (`@test/*`).
 */
import { fileURLToPath } from 'node:url';

export const PACKAGES = fileURLToPath(new URL('../../packages', import.meta.url));

const WEB = fileURLToPath(new URL('..', import.meta.url));

export const packageAliases = ['core', 'design', 'notes', 'contacts', 'calendar', 'pages'].map(name => ({ find: `@unlease/${name}`, replacement: `${PACKAGES}/${name}/src` }));

export const appAliases = [
  { find: /^@shared\//, replacement: `${WEB}shared/src/` },
  { find: /^@notes\//, replacement: `${WEB}notes/src/` },
  { find: /^@pages\//, replacement: `${WEB}pages/src/` },
  { find: /^@contacts\//, replacement: `${WEB}contacts/src/` },
  { find: /^@calendar\//, replacement: `${WEB}calendar/src/` },
  { find: /^@demo\//, replacement: `${WEB}demo/` },
  { find: /^@test\//, replacement: `${WEB}shared/test/` },
];
