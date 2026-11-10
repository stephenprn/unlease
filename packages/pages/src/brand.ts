/**
 * Pages' name and slug, from the suite's registry (`@unlease/core/apps`): ESLint refuses the name
 * written out elsewhere. `APP_SLUG` names the phone app's database: changing it starts the phone on
 * empty storage, so it must never change once a device holds data.
 */
import { APPS } from '@unlease/core/apps';

export const APP_NAME = APPS.pages.name;
export const APP_SLUG = APPS.pages.slug;
export const APP_SCHEME = APPS.pages.scheme;
