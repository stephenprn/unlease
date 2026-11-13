/** Pages' own section of the Administration (the questions about pages, in the Claude form too), in its Administration and its setup. */
import { t } from '@unlease/core/i18n';
import { PAGES_ASK_INFO, pagesAskLine } from '@unlease/pages/services/pagesAsk';

import type { AdminSection } from '@shared/modules';
import { PagesAskSection } from './ui/features/settings/PagesAskSection';

export const PAGES_ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'pages-ask', app: 'pages', title: () => t('Questions about pages'), glyph: 'bubble', line: settings => pagesAskLine(settings.pages), info: PAGES_ASK_INFO, claude: true, Body: PagesAskSection },
];
