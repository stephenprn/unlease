/**
 * Wallet's lint: the suite's phone rules and layering (`../shared/config/eslint.cjs`) over its own
 * layers (`@app`, `@data`, `@ui`, `@platform`, and the shared ones). Of Contacts it borrows its
 * projection alone (`@contacts-app/app/store/contactsProjection`), to name whom a paper concerns.
 */
const { phoneLint } = require('../shared/config/eslint.cjs');

const CONTACTS_PIECES = '^@contacts-app/(?!app/store/contactsProjection$)';

module.exports = [
  ...phoneLint({
    appDir: __dirname,
    layers: { app: ['@app', '@shared/app'], data: ['@data', '@shared/data'], ui: ['@ui', '@shared/ui'], platform: ['@platform', '@shared/platform'] },
    forbidden: [
      { regex: CONTACTS_PIECES, message: 'Contacts is its own app: borrow only its projection; open a contact there (`openInApp`).' },
      { group: ['**/mobile/contacts/**'], message: 'Contacts\' projection is borrowed through `@contacts-app/*`.' },
    ],
  }),
];
