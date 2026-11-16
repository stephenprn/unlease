/**
 * Clock's lint: the suite's phone rules and layering (`../shared/config/eslint.cjs`) over its own
 * layers (`@app`, `@data`, `@ui`, `@platform`, and the shared ones). Clock shows Agenda's events (as an
 * alarm rings, and the evening before) through Agenda's projection alone, borrowed as a leaf
 * (`@calendar-app/app/store/calendarProjection`), as Agenda borrows Contacts'; a place in another app
 * opens there (`openInApp`). Its own projection (`src/app/store/clockProjection.ts`) is a leaf too.
 */
const { phoneLint } = require('../shared/config/eslint.cjs');

const CALENDAR_PIECES = '^@calendar-app/(?!app/store/calendarProjection$)';

module.exports = [
  ...phoneLint({
    appDir: __dirname,
    layers: { app: ['@app', '@shared/app'], data: ['@data', '@shared/data'], ui: ['@ui', '@shared/ui'], platform: ['@platform', '@shared/platform'] },
    forbidden: [
      { regex: CALENDAR_PIECES, message: 'Agenda is its own app: borrow only its projection; open an event there (`openInApp`).' },
      { group: ['@carnet/*', '@contacts-app/*', '@pages-app/*'], message: 'Clock shows only Agenda\'s records: open another app\'s places there (`openInApp`).' },
      { group: ['**/mobile/notes/**', '**/mobile/contacts/**', '**/mobile/pages/**', '**/mobile/calendar/**'], message: 'Agenda\'s projection is borrowed through its alias (`@calendar-app/*`).' },
      { group: ['@unlease/notes/*', '@unlease/contacts/*', '@unlease/pages/*'], message: 'Clock reads Agenda\'s records alone: core, design, Agenda\'s package and its own.' },
    ],
  }),
  {
    files: ['src/app/store/clockProjection.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@app/*', '@ui/*', '@data/*', '@platform/*', './*', '../*'], message: 'The projection is a leaf: only the shared code and the packages.' }] }],
    },
  },
];
