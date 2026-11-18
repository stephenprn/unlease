/** The suite's Administration (`@shared/ui/screens/AdminScreen`) as Wallet's: what every app shares; Wallet adds none (Claude's key is the shared section's). */
import React from 'react';

import { AdminScreen as SuiteAdmin } from '@shared/ui/screens/AdminScreen';

import type { ScreenProps } from '../navigation/types';

export function AdminScreen({ navigation, route }: ScreenProps<'Admin'>) {
  return <SuiteAdmin app="wallet" section={route.params?.section ?? null} onBack={() => navigation.goBack()} onOpen={section => navigation.push('Admin', { section })} appSections={[]} />;
}
