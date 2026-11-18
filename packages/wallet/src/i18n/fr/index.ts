/**
 * Wallet’s French: its models and services, its phone's and its web's screens. One part per area;
 * `tools/i18n/check.mjs` lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { FR_SCREENS } from './screens';
import { FR_SHARED } from './shared';

export const WALLET_FRENCH: Dictionary = {
  ...FR_SHARED,
  ...FR_SCREENS,
};
