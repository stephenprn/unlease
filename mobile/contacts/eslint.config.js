/**
 * Contacts' lint: the suite's phone rules and layering (`../shared/config/eslint.cjs`) over its own
 * layers (`@app`, `@data`, `@ui`, `@platform`, and the shared ones). Contacts shows no other app's
 * records: a place in another app opens there (`openInApp`). Its projection
 * (`src/app/store/contactsProjection.ts`) is a leaf other apps may borrow: it imports only the shared
 * code and the packages.
 */
const { phoneLint } = require('../shared/config/eslint.cjs');

module.exports = [
  ...phoneLint({
    appDir: __dirname,
    layers: { app: ['@app', '@shared/app'], data: ['@data', '@shared/data'], ui: ['@ui', '@shared/ui'], platform: ['@platform', '@shared/platform'] },
    forbidden: [
      { group: ['**/mobile/notes/**', '**/mobile/pages/**', '@carnet/*'], message: 'Contacts is its own app: open another app\'s places there (`openInApp`).' },
      { group: ['@unlease/notes/*', '@unlease/pages/*'], message: 'Contacts reads no other app\'s records: core, design and its own package.' },
    ],
  }),
  {
    files: ['src/app/store/contactsProjection.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@app/*', '@ui/*', '@data/*', '@platform/*', './*', '../*'], message: 'The projection is a leaf other apps borrow: only the shared code and the packages.' }] }],
    },
  },
];
