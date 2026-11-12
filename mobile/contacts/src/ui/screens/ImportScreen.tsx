/**
 * « Importer », from Réglages › Données, the empty list, a link (`unlease-contacts://import`) or a card
 * shared to the app: Contacts' import wizard (`ContactsImport`) under the screen's top bar. Back goes
 * back a step of the wizard, then leaves.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { Ground, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { ContactsImport } from '../features/importing/ContactsImport';
import type { ScreenProps } from '../navigation/types';

export function ImportScreen({ navigation }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Importer')} onBack={() => navigation.goBack()} />
      <ContactsImport onSeeContacts={() => navigation.navigate('Contacts')} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
  });
