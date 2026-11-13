/**
 * The suite's Administration (`@shared/ui/screens/AdminScreen`) as Agenda's: after what every app
 * shares, its own sections: « Jours fériés » (the country whose holidays the server fetches),
 * « Publication » (one's events at a secret iCal address) and « Questions sur l'agenda ». The home and
 * each section are an `Admin` screen of their own.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { AdminScreen as SuiteAdmin, type AppAdminSection } from '@shared/ui/screens/AdminScreen';
import { HolidaysSection } from '@shared/ui/features/admin/HolidaysSection';
import { HOLIDAYS_INFO, holidaysLine } from '@unlease/calendar/services/admin';

import { ASK_INFO, AskSection, askLine } from '../features/admin/AskSection';
import { PUBLISH_INFO, PublishSection, publishLine } from '../features/admin/PublishSection';
import type { ScreenProps } from '../navigation/types';

/** Agenda's own sections; its questions follow Claude's key in the setup too (`claude`). */
export const SECTIONS: readonly AppAdminSection[] = [
  {
    // The web's ids (its addresses: `/agenda/admin/calendar-holidays`), so a section is the same place on both.
    id: 'calendar-holidays',
    title: () => t('Public holidays'),
    icon: 'sun',
    info: HOLIDAYS_INFO,
    // The web's words (`calendar/services/admin`).
    line: holidaysLine,
    render: ({ server, admin }) => <HolidaysSection server={server} admin={admin} />,
  },
  { id: 'calendar-publish', title: () => t('Publishing'), icon: 'share', info: PUBLISH_INFO, line: publishLine, render: ({ server, admin, overlays }) => <PublishSection server={server} admin={admin} overlays={overlays} /> },
  { id: 'calendar-ask', title: () => t('Questions about the calendar'), icon: 'bubble', info: ASK_INFO, line: askLine, render: ({ server, admin }) => <AskSection server={server} admin={admin} />, claude: true },
];

export function AdminScreen({ navigation, route }: ScreenProps<'Admin'>) {
  return <SuiteAdmin app="calendar" section={route.params?.section ?? null} onBack={() => navigation.goBack()} onOpen={section => navigation.push('Admin', { section })} appSections={SECTIONS} />;
}
