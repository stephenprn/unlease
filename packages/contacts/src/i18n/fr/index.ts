/**
 * Contacts’ French: its models and services, its phone's and its web's screens. One part per area;
 * `tools/i18n/check.mjs` lists what is missing. Pages mentions contacts, so a program showing Pages
 * adds Contacts’ French too (`addPagesFrench`).
 */
import type { Dictionary } from '@unlease/core/i18n';
import { FR_PHONE } from './phone';
import { FR_SETTINGS_PLACES } from './settingsPlaces';
import { FR_SHARED } from './shared';
import { FR_WEB } from './web';
import { FR_WISHES } from './wishes';
import { FR_IMMICH } from './immich';

export const CONTACTS_FRENCH: Dictionary = {
  ...FR_SHARED,
  ...FR_SETTINGS_PLACES,
  ...FR_PHONE,
  ...FR_WEB,
  ...FR_WISHES,
  ...FR_IMMICH,
};
