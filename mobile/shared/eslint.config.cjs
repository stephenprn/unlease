/**
 * The shared phone code's lint, run by each app (`npm run lint` there, with ESLint's lookup from the
 * file: `--flag v10_config_lookup_from_file`): the layering, and no app at all here (no app's code,
 * no app's package: what an app adds comes in through props and registrations).
 */
const path = require('path');
const { phoneLint } = require('./config/eslint.cjs');

/** The app running the lint: its node_modules hold ESLint's plugins. */
const appDir = process.env.UNLEASE_APP_DIR ?? process.cwd();

module.exports = phoneLint({
  appDir: path.resolve(appDir),
  layers: { app: ['@shared/app'], data: ['@shared/data'], ui: ['@shared/ui'], platform: ['@shared/platform'] },
  forbidden: [
    { group: ['@app/*', '@ui/*', '@data/*', '@platform/*', '@carnet/*', '@pages-app/*'], message: 'The shared code imports no app: an app hands in what it adds.' },
    { group: ['@unlease/notes/*', '@unlease/pages/*'], message: 'The shared code counts on core and design only (each app brings its own package).' },
  ],
});
