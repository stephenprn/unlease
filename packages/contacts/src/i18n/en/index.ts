/**
 * Contacts' English: its models and services, its phone's and its web's screens. One part per area;
 * `tools/i18n/check.mjs` lists what is missing. Pages mentions contacts, so a program showing Pages
 * adds Contacts' English too (`addPagesEnglish`).
 */
import type { Dictionary } from '@unlease/core/i18n';
import { EN_PHONE } from './phone';
import { EN_SETTINGS_PLACES } from './settingsPlaces';
import { EN_SHARED } from './shared';
import { EN_WEB } from './web';
import { EN_WISHES } from './wishes';

export const CONTACTS_ENGLISH: Dictionary = {
  ...EN_SHARED,
  ...EN_SETTINGS_PLACES,
  ...EN_PHONE,
  ...EN_WEB,
  ...EN_WISHES,
};
