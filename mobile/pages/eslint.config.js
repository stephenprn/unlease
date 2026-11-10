/**
 * Pages' lint: the suite's phone rules and layering (`../shared/config/eslint.cjs`) over its own
 * layers (`@app`, `@data`, `@ui`, `@platform`, and the shared ones). Carnet is its own app
 * (`carnet://`): Pages borrows only the pieces it shows (`@carnet/*`: its projection, its link rows
 * and their stamp, its drawings, its note text), never Carnet's store, actions, navigation or screens: loading them
 * would make a second library in this process. Of Contacts it borrows its projection alone
 * (`@contacts-app/app/store/contactsProjection`), to name the people pages mention.
 */
const { phoneLint } = require('../shared/config/eslint.cjs');

const CARNET_PIECES = '^@carnet/(?!app/store/(notesProjection|eventsProjection)$|ui/components/Stamp$|ui/features/(drawing|links|note|events)/)';
const CONTACTS_PIECES = '^@contacts-app/(?!app/store/contactsProjection$)';

module.exports = [
  ...phoneLint({
    appDir: __dirname,
    layers: { app: ['@app', '@shared/app'], data: ['@data', '@shared/data'], ui: ['@ui', '@shared/ui'], platform: ['@platform', '@shared/platform'] },
    forbidden: [
      { regex: CARNET_PIECES, message: 'Carnet is its own app: borrow only its projection and the pieces Pages shows (ui/features/drawing, links, note); open the rest there (`openInApp`).' },
      { group: ['**/mobile/notes/**'], message: 'Carnet\'s files are borrowed through `@carnet/*`.' },
      { regex: CONTACTS_PIECES, message: 'Contacts is its own app: borrow only its projection; open a contact there (`openInApp`).' },
      { group: ['**/mobile/contacts/**'], message: 'Contacts\' projection is borrowed through `@contacts-app/*`.' },
    ],
  }),
];
