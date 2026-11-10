/**
 * Agenda's English: its models and services, its phone's and its web's screens. One part per area;
 * `tools/i18n/check.mjs` lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { EN_BIRTHDAY_PAGE } from './birthdayPage';
import { EN_PHONE } from './phone';
import { EN_SETTINGS_PLACES } from './settingsPlaces';
import { EN_SHARED } from './shared';
import { EN_SHOWN } from './shown';
import { EN_TODAY } from './today';
import { EN_WEB } from './web';

export const CALENDAR_ENGLISH: Dictionary = {
  ...EN_SHARED,
  ...EN_SETTINGS_PLACES,
  ...EN_PHONE,
  ...EN_WEB,
  ...EN_SHOWN,
  ...EN_TODAY,
  ...EN_BIRTHDAY_PAGE,
};
