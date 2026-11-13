/**
 * Réglages' « Importer »: the Keep import's wizard (`features/importing/KeepWizard`) under the top bar;
 * the first run offers the same wizard as one of its steps.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';

import { Ground, TopBar } from '../components';
import { KeepWizard } from '../features/importing/KeepWizard';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export function ImportScreen({ navigation }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);

  // Back to the board under this screen; from the pages' home, the board takes its place (the two homes are peers).
  const toBoard = () => {
    if (navigation.getState().routes.some(route => route.name === 'Board')) navigation.popTo('Board', { view: 'notes' });
    else navigation.reset({ index: 0, routes: [{ name: 'Board', params: { view: 'notes' } }] });
  };

  return (
    <View style={styles.screen}>
      <Ground />
      {/* Leaving mid-way sets the archive read aside: the wizard removes its files as it goes. */}
      <TopBar title={t('Import')} onBack={() => navigation.goBack()} />
      <KeepWizard onBoard={toBoard} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
  });
