/**
 * Carnet's name and slug, from the suite's registry (`@unlease/core/apps`): ESLint refuses the name
 * written out elsewhere. `APP_SLUG` names the databases, the browser storage and the `carnet://` links:
 * changing it starts every client on empty storage, so it must never change once a device holds data.
 */
import { APPS } from '@unlease/core/apps';

export const APP_NAME = APPS.notes.name;
export const APP_SLUG = APPS.notes.slug;
