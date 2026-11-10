/**
 * The suite's Administration (`@shared/ui/screens/AdminScreen`) as Carnet's: after what every app
 * shares, Carnet's own section, Seerr for the films and series, and its part of the Claude section
 * (what a link read costs, the links kept unread). The home and each section are an `Admin` screen
 * of their own.
 */
import React from 'react';

import { seerrLine } from '@unlease/notes/services/admin';
import { AdminScreen as SuiteAdmin, type AppAdminSection } from '@shared/ui/screens/AdminScreen';
import { SEERR_INFO, SeerrSection } from '@shared/ui/features/admin/SeerrSection';

import { linkReadingExtra } from '../features/settings/LinkReading';
import type { ScreenProps } from '../navigation/types';

const SECTIONS: readonly AppAdminSection[] = [
  {
    id: 'seerr',
    title: () => 'Seerr',
    icon: 'film',
    info: SEERR_INFO,
    line: settings => seerrLine(settings.seerr),
    render: ({ server, admin, overlays }) => <SeerrSection server={server} admin={admin} overlays={overlays} />,
  },
];

export function AdminScreen({ navigation, route }: ScreenProps<'Admin'>) {
  return (
    <SuiteAdmin
      app="notes"
      section={route.params?.section ?? null}
      onBack={() => navigation.goBack()}
      onOpen={section => navigation.push('Admin', { section })}
      claudeExtra={linkReadingExtra}
      appSections={SECTIONS}
    />
  );
}
