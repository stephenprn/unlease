/**
 * The suite's Administration (`@shared/ui/screens/AdminScreen`) as Pages': after what every app
 * shares, its own section: « Questions sur les pages » (whether a page offers « Demander à Claude »,
 * and how far one question reads). The home and each section are an `Admin` screen of their own.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { PAGES_ASK_INFO, pagesAskLine } from '@unlease/pages/services/pagesAsk';
import { AdminScreen as SuiteAdmin, type AppAdminSection } from '@shared/ui/screens/AdminScreen';

import { PagesAskSection } from '../features/admin/PagesAskSection';
import type { ScreenProps } from '../navigation/types';

/** Pages' own sections; its questions follow Claude's key in the setup too (`claude`). */
export const SECTIONS: readonly AppAdminSection[] = [
  {
    id: 'pages-ask',
    title: () => t('Questions sur les pages'),
    icon: 'bubble',
    info: PAGES_ASK_INFO,
    line: settings => pagesAskLine(settings.pages),
    render: ({ server, admin }) => <PagesAskSection server={server} admin={admin} />,
    claude: true,
  },
];

export function AdminScreen({ navigation, route }: ScreenProps<'Admin'>) {
  return (
    <SuiteAdmin
      app="pages"
      section={route.params?.section ?? null}
      onBack={() => navigation.goBack()}
      onOpen={section => navigation.push('Admin', { section })}
      appSections={SECTIONS}
    />
  );
}
