/**
 * Agenda’s French: its models and services, its phone's and its web's screens. One part per area;
 * `tools/i18n/check.mjs` lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { FR_BIRTHDAY_PAGE } from './birthdayPage';
import { FR_DIGEST } from './digest';
import { FR_PHONE } from './phone';
import { FR_SETTINGS_PLACES } from './settingsPlaces';
import { FR_SHARED } from './shared';
import { FR_SHOWN } from './shown';
import { FR_TODAY } from './today';
import { FR_WEB } from './web';

export const CALENDAR_FRENCH: Dictionary = {
  ...FR_SHARED,
  ...FR_SETTINGS_PLACES,
  ...FR_PHONE,
  ...FR_WEB,
  ...FR_SHOWN,
  ...FR_TODAY,
  ...FR_BIRTHDAY_PAGE,
  ...FR_DIGEST,
};
