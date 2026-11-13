/**
 * Pages’ French: its models and services, the questions to Claude, its phone's and its web's
 * screens. One part per area; `tools/i18n/check.mjs` lists what is missing. Pages shows Carnet's
 * collections, notes and links, so a program showing Pages adds Carnet’s French too (`addPagesFrench`).
 */
import type { Dictionary } from '@unlease/core/i18n';
import { FR_ASK } from './ask';
import { FR_PHONE_PAGES } from './phonePages';
import { FR_PHONE_PAGES_INLINE } from './phonePagesInline';
import { FR_WEB_PAGES } from './webPages';
import { FR_WEB_PAGES_INLINE } from './webPagesInline';
import { FR_SHARED } from './shared';
import { FR_TEMPLATES } from './templates';
import { FR_REORDER } from './reorder';
import { FR_IMPORTING } from './importing';
import { FR_IMMICH } from './immich';
import { FR_VERSIONS } from './versions';

export const PAGES_FRENCH: Dictionary = {
  ...FR_SHARED,
  ...FR_PHONE_PAGES,
  ...FR_PHONE_PAGES_INLINE,
  ...FR_WEB_PAGES,
  ...FR_WEB_PAGES_INLINE,
  ...FR_ASK,
  ...FR_TEMPLATES,
  ...FR_REORDER,
  ...FR_IMPORTING,
  ...FR_IMMICH,
  ...FR_VERSIONS,
};
