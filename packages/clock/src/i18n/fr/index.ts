/**
 * Clock’s French: its models and services, its phone's and its web's screens. One part per area;
 * `tools/i18n/check.mjs` lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { FR_HOME } from './home';
import { FR_PHONE } from './phone';
import { FR_RING } from './ring';
import { FR_SHARED } from './shared';
import { FR_WEB } from './web';

export const CLOCK_FRENCH: Dictionary = {
  ...FR_SHARED,
  ...FR_RING,
  ...FR_HOME,
  ...FR_PHONE,
  ...FR_WEB,
};
