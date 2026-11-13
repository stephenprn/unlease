/**
 * « Importer » (Réglages › Données, an `.ics` shared or opened with Agenda): the import wizard
 * (`features/importing/CalendarImport`) under the top bar, Back going back a step while it runs.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';

import { Ground, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { CalendarImport } from '../features/importing/CalendarImport';
import type { ScreenProps } from '../navigation/types';

export function ImportScreen({ navigation }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Import')} onBack={() => navigation.goBack()} />
      <CalendarImport />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
  });
