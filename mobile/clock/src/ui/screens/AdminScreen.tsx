/**
 * The suite's Administration (`@shared/ui/screens/AdminScreen`) as Clock's: what every app shares
 * (the server, Claude, backups, the drive, the apps). Clock has no server setting of its own.
 * The home and each section are an `Admin` screen of their own.
 */
import React from 'react';

import { AdminScreen as SuiteAdmin } from '@shared/ui/screens/AdminScreen';

import type { ScreenProps } from '../navigation/types';

export function AdminScreen({ navigation, route }: ScreenProps<'Admin'>) {
  return <SuiteAdmin app="clock" section={route.params?.section ?? null} onBack={() => navigation.goBack()} onOpen={section => navigation.push('Admin', { section })} />;
}
