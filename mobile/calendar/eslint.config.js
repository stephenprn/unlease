/**
 * Agenda's lint: the suite's phone rules and layering (`../shared/config/eslint.cjs`) over its own
 * layers (`@app`, `@data`, `@ui`, `@platform`, and the shared ones). Agenda shows what the other apps
 * hold (Carnet's reminders, Contacts' birthdays, Pages' dates) through their projections alone, borrowed
 * as leaves (`@carnet/app/store/notesProjection`, `@contacts-app/app/store/contactsProjection`,
 * `@pages-app/app/store/blocksProjection`); a place in another app opens there (`openInApp`).
 */
const { phoneLint } = require('../shared/config/eslint.cjs');

const CARNET_PIECES = '^@carnet/(?!app/store/notesProjection$)';
const CONTACTS_PIECES = '^@contacts-app/(?!app/store/contactsProjection$)';
const PAGES_PIECES = '^@pages-app/(?!app/store/blocksProjection$)';

module.exports = [
  ...phoneLint({
    appDir: __dirname,
    layers: { app: ['@app', '@shared/app'], data: ['@data', '@shared/data'], ui: ['@ui', '@shared/ui'], platform: ['@platform', '@shared/platform'] },
    forbidden: [
      { regex: CARNET_PIECES, message: 'Carnet is its own app: borrow only its projection; open a note there (`openInApp`).' },
      { regex: CONTACTS_PIECES, message: 'Contacts is its own app: borrow only its projection; open a contact there (`openInApp`).' },
      { regex: PAGES_PIECES, message: 'Pages is its own app: borrow only its projection; open a page there (`openInApp`).' },
      { group: ['**/mobile/notes/**', '**/mobile/contacts/**', '**/mobile/pages/**'], message: 'Another app\'s files are borrowed through its alias (`@carnet/*`, `@contacts-app/*`, `@pages-app/*`).' },
    ],
  }),
];
