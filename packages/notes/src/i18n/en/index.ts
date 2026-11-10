/**
 * Carnet's English: its models and services, its server routes' messages, its phone's and its web's
 * screens. One part per area, each written by whoever owns that area's screens; `tools/i18n/check.mjs`
 * lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { EN_DRAWING } from './drawing';
import { EN_LINE_VIEWS } from './lineViews';
import { EN_NOTES } from './notes';
import { EN_PHONE } from './phone';
import { EN_PHONE_DRAWING } from './phoneDrawing';
import { EN_PHONE_FEATURES } from './phoneFeatures';
import { EN_PHONE_RICH_NOTES } from './phoneRichNotes';
import { EN_PHONE_TEMPLATES } from './phoneTemplates';
import { EN_PRICE_WATCH } from './priceWatch';
import { EN_NOTE_HISTORY } from './noteHistory';
import { EN_SERVER } from './server';
import { EN_WEB } from './web';
import { EN_WEB_DRAWING } from './webDrawing';
import { EN_WEB_FEATURES } from './webFeatures';
import { EN_WEB_RICH_NOTES } from './webRichNotes';
import { EN_WEB_TEMPLATES } from './webTemplates';
import { EN_SHARED } from './shared';
import { EN_TEMPLATES } from './templates';
import { EN_TEMPLATE_TRY } from './templateTry';

export const NOTES_ENGLISH: Dictionary = {
  ...EN_SHARED,
  ...EN_TEMPLATES,
  ...EN_TEMPLATE_TRY,
  ...EN_SERVER,
  ...EN_NOTES,
  ...EN_DRAWING,
  ...EN_PHONE,
  ...EN_PHONE_FEATURES,
  ...EN_PHONE_RICH_NOTES,
  ...EN_PHONE_DRAWING,
  ...EN_PHONE_TEMPLATES,
  ...EN_WEB,
  ...EN_WEB_FEATURES,
  ...EN_WEB_RICH_NOTES,
  ...EN_WEB_TEMPLATES,
  ...EN_WEB_DRAWING,
  ...EN_LINE_VIEWS,
  ...EN_PRICE_WATCH,
  ...EN_NOTE_HISTORY,
};
