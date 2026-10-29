/**
 * Carnet's English: its models and services, its server routes' messages, its phone's and its web's
 * screens. One part per area, each written by whoever owns that area's screens; `tools/i18n/check.mjs`
 * lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { EN_ASK } from './ask';
import { EN_DRAWING } from './drawing';
import { EN_NOTES } from './notes';
import { EN_PHONE } from './phone';
import { EN_PHONE_DRAWING } from './phoneDrawing';
import { EN_PHONE_FEATURES } from './phoneFeatures';
import { EN_PHONE_PAGES } from './phonePages';
import { EN_PHONE_PAGES_INLINE } from './phonePagesInline';
import { EN_PHONE_RICH_NOTES } from './phoneRichNotes';
import { EN_SERVER } from './server';
import { EN_WEB } from './web';
import { EN_WEB_DRAWING } from './webDrawing';
import { EN_WEB_FEATURES } from './webFeatures';
import { EN_WEB_PAGES } from './webPages';
import { EN_WEB_PAGES_INLINE } from './webPagesInline';
import { EN_WEB_RICH_NOTES } from './webRichNotes';

export const NOTES_ENGLISH: Dictionary = {
  ...EN_SERVER,
  ...EN_NOTES,
  ...EN_DRAWING,
  ...EN_PHONE,
  ...EN_PHONE_FEATURES,
  ...EN_PHONE_PAGES,
  ...EN_PHONE_PAGES_INLINE,
  ...EN_PHONE_RICH_NOTES,
  ...EN_PHONE_DRAWING,
  ...EN_WEB,
  ...EN_WEB_FEATURES,
  ...EN_WEB_PAGES,
  ...EN_WEB_PAGES_INLINE,
  ...EN_WEB_RICH_NOTES,
  ...EN_WEB_DRAWING,
  ...EN_ASK,
};
