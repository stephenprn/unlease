/**
 * A sheet of the settings or the Administration, under its title; `info` puts the "how it works"
 * pebble beside the title. Without a title, the sheet alone (a setup step heads its own).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';

import { AppText, Grain, Organic } from '../../components';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { InfoBubble, InfoButton, useInfoBubble } from './InfoBubble';
import { useAnchorLayout } from './SettingsScroll';

/** `anchor`: its address in Réglages (`SETTINGS_SECTIONS`, an app's own), where a search lands (`SettingsScroll`). */
export function Section({ title, info, children, anchor }: { title?: string; info?: string; children: React.ReactNode; anchor?: string }) {
  const styles = useThemedStyles(makeStyles);
  const bubble = useInfoBubble();
  const onLayout = useAnchorLayout(anchor);
  return (
    <View style={styles.section} onLayout={onLayout}>
      {title ? (
        <View style={styles.sectionHead}>
          <AppText variant="section" style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </AppText>
          {info ? <InfoButton open={bubble.open} label={bubble.open ? t('Masquer l’explication') : t('Comment ça marche')} onPress={bubble.toggle} style={styles.info} /> : null}
        </View>
      ) : null}
      {title && info && bubble.open ? <InfoBubble text={t(info)} style={styles.bubble} /> : null}
      <Organic outline="panel" style={styles.card}>
        <Organic outline="panel" style={styles.cardClip}>
          <Grain />
          {children}
        </Organic>
      </Organic>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { gap: 8 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
    // The info pebble (40, in its 48 slot) reaches past the head, which keeps every title's height: a section explaining itself sits as far from its neighbours as one that does not.
    info: { marginVertical: -8 },
    // Clear of the pebble reaching under the head, so its pointer stands under it without touching.
    bubble: { marginTop: 4 },
    // In line with what the panels hold (16 in from their edge), not with the edge itself.
    sectionTitle: { paddingHorizontal: 16 },
    card: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card },
    cardClip: { overflow: 'hidden', paddingVertical: 4 },
  });
