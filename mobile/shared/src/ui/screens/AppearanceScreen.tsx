/**
 * « Apparence », a page of Réglages in every app: the theme and the paper's grain, then « Couleurs »
 * and « Fond » with their editors, as Android's settings open a large group of related settings on a
 * page of their own, reached by a row of the same name. Each app's navigator shows it as its
 * `Appearance` screen (Back returns to Réglages, or to the search that opened it), scrolled to the
 * section a search asked for (`appearance`, `colors`, `ground`: `settingsScreenOf`). A change of
 * look here offers to send it to the other apps (`useLookShareHint`), and a change of colours points
 * once to the other services' sheets (`useServicesCssHint`).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';

import { Ground, TopBar } from '../components';
import { ColorsSection, GroundSection, useAppearanceEditors } from '../features/appearance/AppearanceSections';
import { useLookShareHint } from '../features/appearance/LookShare';
import { useServicesCssHint } from '../features/appearance/ServicesCssSheet';
import { ThemeSection } from '../features/settings/DeviceSections';
import { SettingsScroll } from '../features/settings/SettingsScroll';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

export interface AppearanceScreenProps {
  /** The section a search asked for (`SETTINGS_SECTIONS`), landed on once laid out. */
  readonly section?: string | null;
  readonly onBack: () => void;
}

export function AppearanceScreen({ section, onBack }: AppearanceScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const { editColor, editGradient, editors } = useAppearanceEditors();
  useLookShareHint();
  useServicesCssHint();
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Apparence')} onBack={onBack} />
      <SettingsScroll section={section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemeSection />
        <ColorsSection onEdit={editColor} />
        <GroundSection onEditColor={() => editColor('ground')} onEditGradient={editGradient} />
      </SettingsScroll>
      {editors}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    // As Réglages' own page.
    content: { padding: 12, paddingBottom: 48, gap: 20 },
  });
