/**
 * Pages' English: its models and services, the questions to Claude, its phone's and its web's
 * screens. One part per area; `tools/i18n/check.mjs` lists what is missing. Pages shows Carnet's
 * collections, notes and links, so a program showing Pages adds Carnet's English too (`addPagesEnglish`).
 */
import type { Dictionary } from '@unlease/core/i18n';
import { EN_ASK } from './ask';
import { EN_PHONE_PAGES } from './phonePages';
import { EN_PHONE_PAGES_INLINE } from './phonePagesInline';
import { EN_WEB_PAGES } from './webPages';
import { EN_WEB_PAGES_INLINE } from './webPagesInline';
import { EN_SHARED } from './shared';
import { EN_TEMPLATES } from './templates';
import { EN_REORDER } from './reorder';
import { EN_IMPORTING } from './importing';

export const PAGES_ENGLISH: Dictionary = {
  ...EN_SHARED,
  ...EN_PHONE_PAGES,
  ...EN_PHONE_PAGES_INLINE,
  ...EN_WEB_PAGES,
  ...EN_WEB_PAGES_INLINE,
  ...EN_ASK,
  ...EN_TEMPLATES,
  ...EN_REORDER,
  ...EN_IMPORTING,
};
