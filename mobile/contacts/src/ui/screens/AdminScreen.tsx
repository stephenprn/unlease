/**
 * The suite's Administration (`@shared/ui/screens/AdminScreen`) as Contacts': what every app shares
 * (the server, Claude, backups, the drive, the apps). Contacts has no server setting of its own yet.
 * The home and each section are an `Admin` screen of their own.
 */
import React from 'react';

import { AdminScreen as SuiteAdmin } from '@shared/ui/screens/AdminScreen';

import type { ScreenProps } from '../navigation/types';

export function AdminScreen({ navigation, route }: ScreenProps<'Admin'>) {
  return <SuiteAdmin app="contacts" section={route.params?.section ?? null} onBack={() => navigation.goBack()} onOpen={section => navigation.push('Admin', { section })} />;
}
