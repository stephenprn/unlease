/**
 * The app off: connected to a server that does not run this app (its Administration turned it off,
 * or it was never chosen), the phone says so over everything, with the one way out: turn it on
 * there (`PUT /api/settings { apps }`). Its data was kept meanwhile; nothing else changes. The
 * Réglages stay in reach (another server, or this phone alone).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { appOffWords } from '@unlease/core/services/setup';
import { rememberServerSettings, selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { AppText, Button, EdgeScrollView, Ground } from '../components';
import { BrandMark } from '../icons/BrandMark';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

/** Whether this app is off on the server it is connected to, as the server last said. */
export function useAppOff(app: AppId): boolean {
  const apps = useSettingsStore(selectServerApps);
  const onboarded = useSettingsStore(s => s.onboarded);
  return onboarded && apps !== null && !apps.includes(app);
}

export function AppOffScreen({ app, onSettings }: { app: AppId; onSettings?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const [busy, setBusy] = useState(false);
  const words = appOffWords(app);

  const turnOn = async () => {
    if (!server) return;
    setBusy(true);
    try {
      const settings = await saveServerSettings(server, { apps: [...(apps ?? []).filter(id => id !== app), app] });
      rememberServerSettings(settings);
      showSnack(t('{app} activé sur le serveur', { app: APPS[app].name }), undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Réglage refusé'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Ground />
      <EdgeScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <BrandMark app={app} size={72} />
        <AppText variant="title" accessibilityRole="header" style={styles.center}>
          {words.title}
        </AppText>
        <AppText variant="body" color={theme.color.inkMuted} style={styles.center}>
          {words.lead}
        </AppText>
        <Button label={words.action} icon="server" busy={busy} disabled={!server} onPress={turnOn} style={styles.action} />
        {server ? (
          <AppText variant="meta" style={styles.center}>
            {server.url.replace(/^https?:\/\//, '')}
          </AppText>
        ) : null}
        {onSettings ? <Button kind="text" label={t('Réglages')} icon="settings" onPress={onSettings} /> : null}
      </EdgeScrollView>
    </View>
  );
}

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    content: { flexGrow: 1, alignItems: 'center', gap: 16, paddingHorizontal: 24 },
    center: { textAlign: 'center', maxWidth: 360 },
    action: { alignSelf: 'stretch' },
  });
