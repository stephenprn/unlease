/**
 * Carnet's lint: the suite's phone rules and layering (`../shared/config/eslint.cjs`) over its own
 * layers (`@app`, `@data`, `@ui`, `@platform`, and the shared ones), and Pages' code kept out: Pages
 * is its own app (`unlease-pages://`), and only its contracts' types may be named here. Of Contacts it
 * borrows its projection alone (`@contacts-app/app/store/contactsProjection`), to name the people a
 * note mentions.
 */
const { phoneLint } = require('../shared/config/eslint.cjs');

module.exports = [
  ...phoneLint({
    appDir: __dirname,
    layers: { app: ['@app', '@shared/app'], data: ['@data', '@shared/data'], ui: ['@ui', '@shared/ui'], platform: ['@platform', '@shared/platform'] },
    forbidden: [
      { group: ['@pages-app/*', '**/mobile/pages/**'], message: 'Pages is its own app: open it (`openInApp`), never import it.' },
      { regex: '^@contacts-app/(?!app/store/contactsProjection$)', message: 'Contacts is its own app: borrow only its projection; open a contact there (`openInApp`).' },
      { group: ['**/mobile/contacts/**'], message: 'Contacts\' projection is borrowed through `@contacts-app/*`.' },
    ],
  }),
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      // Pages' package may lend its contracts' types (`CopyRequest`), never load: its record types are Pages'.
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [{ group: ['@unlease/pages/*'], allowTypeImports: true, message: 'Only types from Pages\' package: loading it declares its record types in Carnet.' }] }],
    },
  },
];
