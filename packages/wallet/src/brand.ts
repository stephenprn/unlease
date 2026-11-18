/**
 * Wallet's name and slug, from the suite's registry (`@unlease/core/apps`): ESLint refuses the name
 * written out elsewhere. `APP_SLUG` names the phone app's database and the web app's storage: it
 * must never change once a device holds data.
 */
import { APPS } from '@unlease/core/apps';

export const APP_NAME = APPS.wallet.name;
export const APP_SLUG = APPS.wallet.slug;
export const APP_SCHEME = APPS.wallet.scheme;
