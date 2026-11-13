/**
 * Carnet’s French: its models and services, its server routes' messages, its phone's and its web's
 * screens. One part per area, each written by whoever owns that area's screens; `tools/i18n/check.mjs`
 * lists what is missing.
 */
import type { Dictionary } from '@unlease/core/i18n';
import { FR_DRAWING } from './drawing';
import { FR_FACTS } from './facts';
import { FR_IMPORTING } from './importing';
import { FR_LINE_VIEWS } from './lineViews';
import { FR_NOTES } from './notes';
import { FR_PHONE } from './phone';
import { FR_PHONE_DRAWING } from './phoneDrawing';
import { FR_PHONE_FEATURES } from './phoneFeatures';
import { FR_PHONE_RICH_NOTES } from './phoneRichNotes';
import { FR_PHONE_TEMPLATES } from './phoneTemplates';
import { FR_PRICE_WATCH } from './priceWatch';
import { FR_NOTE_HISTORY } from './noteHistory';
import { FR_SERVER } from './server';
import { FR_WEB } from './web';
import { FR_WEB_DRAWING } from './webDrawing';
import { FR_WEB_FEATURES } from './webFeatures';
import { FR_WEB_RICH_NOTES } from './webRichNotes';
import { FR_WEB_TEMPLATES } from './webTemplates';
import { FR_SHARED } from './shared';
import { FR_TEMPLATES } from './templates';
import { FR_TEMPLATE_TRY } from './templateTry';

export const NOTES_FRENCH: Dictionary = {
  ...FR_SHARED,
  ...FR_TEMPLATES,
  ...FR_FACTS,
  ...FR_TEMPLATE_TRY,
  ...FR_SERVER,
  ...FR_NOTES,
  ...FR_IMPORTING,
  ...FR_DRAWING,
  ...FR_PHONE,
  ...FR_PHONE_FEATURES,
  ...FR_PHONE_RICH_NOTES,
  ...FR_PHONE_DRAWING,
  ...FR_PHONE_TEMPLATES,
  ...FR_WEB,
  ...FR_WEB_FEATURES,
  ...FR_WEB_RICH_NOTES,
  ...FR_WEB_TEMPLATES,
  ...FR_WEB_DRAWING,
  ...FR_LINE_VIEWS,
  ...FR_PRICE_WATCH,
  ...FR_NOTE_HISTORY,
};
