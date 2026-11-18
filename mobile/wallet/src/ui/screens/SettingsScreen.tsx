/**
 * Wallet's settings, in every app's order: « Coffre » (when the papers lock again, the fingerprint,
 * « Verrouiller maintenant », the passphrase, a new recovery kit), « À la caisse » (the screen's
 * brightness, the barcode at the top), then « Apparence », the language, « Données » (erasing) and
 * the way to the Administration.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/wallet/brand';
import { t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { LOCK_AFTER_CHOICES, type LockAfter } from '@unlease/wallet/models/prefs';
import { TILL_SETTINGS_SECTION, VAULT_SETTINGS_SECTION } from '@unlease/wallet/services/settingsPlaces';
import { setPrefs, usePrefsStore } from '@app/store/prefs';
import { disableFingerprint, enableFingerprint, lockPapers, renewRecovery, useVaultStatus, useVaultStore } from '@app/store/vault';
import { biometrics } from '@app/window';

import { AppText, Button, Ground, ListRow, Segmented, Sheet, SheetScroll, Switch, TopBar } from '@shared/ui/components';
import { AdminEntrySection, AppearanceEntrySection, EraseEntryRow, LanguageSection } from '@shared/ui/features/settings/DeviceSections';
import { BackgroundSyncSection } from '@shared/ui/features/settings/BackgroundSyncRows';
import { Section } from '@shared/ui/features/settings/Section';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import { AppearanceScreen } from '@shared/ui/screens/AppearanceScreen';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { PassphraseSheet } from '../features/vault/PassphraseSheet';
import { RecoveryKit } from '../features/vault/RecoveryKit';
import type { ScreenProps } from '../navigation/types';

const LOCK_WORDS: Readonly<Record<LockAfter, string>> = { 0: 'At once', 60: 'After 1 minute', 300: 'After 5 minutes' };

function KitSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = (): void => {
    setCode(null);
    onDismiss();
  };
  return (
    <Sheet visible={visible} onDismiss={close} title={t('New recovery kit')}>
      <SheetScroll contentContainerStyle={styles.sheet}>
        {code ? (
          <>
            <AppText variant="body">{t('Your old kit no longer opens the vault. Keep this one somewhere safe, apart from your devices: it is shown this once.')}</AppText>
            <RecoveryKit code={code} />
            <Button icon="check" label={t('Done')} onPress={close} />
          </>
        ) : (
          <>
            <AppText variant="body">{t('A new code to open the vault if the passphrase is lost. The old kit stops working on every device: make one if it was lost or someone saw it.')}</AppText>
            <Button
              icon="shield"
              label={t('Make a new kit')}
              busy={busy}
              onPress={() => {
                setBusy(true);
                void renewRecovery()
                  .then(setCode)
                  .finally(() => setBusy(false));
              }}
            />
          </>
        )}
      </SheetScroll>
    </Sheet>
  );
}

export function SettingsScreen({ navigation, route }: ScreenProps<'Settings'>) {
  const styles = useThemedStyles(makeStyles);
  const prefs = usePrefsStore();
  const status = useVaultStatus();
  const fingerprint = useVaultStore(s => s.fingerprint);
  const [sheet, setSheet] = useState<'passphrase' | 'kit' | null>(null);
  const open = status === 'open';
  const canFingerprint = biometrics() === 'ready';

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Settings')} onBack={() => navigation.goBack()} />
      <SettingsScroll section={route.params?.section} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackgroundSyncSection />

        <Section title={t('Vault')} anchor={VAULT_SETTINGS_SECTION}>
          <View style={styles.block}>
            <AppText variant="metaStrong">{t('Lock papers again')}</AppText>
            <Segmented<string> label={t('Lock papers again')} value={String(prefs.lockAfter)} onChange={value => setPrefs({ lockAfter: Number(value) as LockAfter })} options={LOCK_AFTER_CHOICES.map(after => ({ value: String(after), label: t(LOCK_WORDS[after]) }))} />
            <AppText variant="meta">{t('Once the app leaves the screen. Your cards stay open.')}</AppText>
          </View>
          <ListRow
            icon="fingerprint"
            title={t('Unlock with your fingerprint')}
            supporting={canFingerprint ? (fingerprint ? t('Your papers open with your fingerprint or your screen lock.') : open ? t('Your papers ask the passphrase each time.') : t('Unlock the vault first.')) : t('Add a fingerprint or a screen lock to this phone first.')}
            disabled={!canFingerprint || (!fingerprint && !open)}
            trailing={<Switch value={fingerprint} disabled={!canFingerprint || (!fingerprint && !open)} accessibilityLabel={t('Unlock with your fingerprint')} onValueChange={on => (on ? void enableFingerprint() : disableFingerprint())} />}
            onPress={canFingerprint && (fingerprint || open) ? () => (fingerprint ? disableFingerprint() : void enableFingerprint()) : undefined}
          />
          <ListRow icon="lock" title={t('Lock now')} supporting={open ? t('Your papers lock; your cards stay open.') : t('Your papers are locked.')} disabled={!open} onPress={open ? () => lockPapers() : undefined} />
          <ListRow icon="key" title={t('Change the passphrase')} disabled={!open} supporting={open ? undefined : t('Unlock the vault to change its passphrase or make a new recovery kit.')} onPress={open ? () => setSheet('passphrase') : undefined} />
          <ListRow icon="shield" title={t('New recovery kit')} disabled={!open} onPress={open ? () => setSheet('kit') : undefined} />
        </Section>

        <Section title={t('At the till')} anchor={TILL_SETTINGS_SECTION}>
          <ListRow icon="sun" title={t('Brighten the screen')} supporting={t('Full brightness while a card shows, so every scanner reads it.')} trailing={<Switch value={prefs.brighten} accessibilityLabel={t('Brighten the screen')} onValueChange={brighten => setPrefs({ brighten })} />} onPress={() => setPrefs({ brighten: !prefs.brighten })} />
          <ListRow icon="barcode" title={t('Barcode at the top of the screen')} supporting={t('Where a till’s scanner reaches it best on some counters.')} trailing={<Switch value={prefs.barcodeTop} accessibilityLabel={t('Barcode at the top of the screen')} onValueChange={barcodeTop => setPrefs({ barcodeTop })} />} onPress={() => setPrefs({ barcodeTop: !prefs.barcodeTop })} />
        </Section>

        <AppearanceEntrySection onOpen={() => navigation.navigate('Appearance')} />
        <LanguageSection />

        <Section title={t('Data')} anchor={SETTINGS_SECTIONS.data}>
          <EraseEntryRow app="wallet" onOpen={() => navigation.navigate('Erase')} />
        </Section>

        <AdminEntrySection onOpen={() => navigation.navigate('Admin')} />

        <AppText variant="meta" style={styles.about}>
          {t('{app} · your cards and papers, sealed on your devices', { app: APP_NAME })}
        </AppText>
      </SettingsScroll>
      <PassphraseSheet visible={sheet === 'passphrase'} onDismiss={() => setSheet(null)} />
      <KitSheet visible={sheet === 'kit'} onDismiss={() => setSheet(null)} />
    </View>
  );
}

/** Réglages' « Apparence » page, from its row or a search. */
export function AppearanceSettingsScreen({ navigation, route }: ScreenProps<'Appearance'>) {
  return <AppearanceScreen section={route.params?.section} onBack={() => navigation.goBack()} />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
    block: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    about: { textAlign: 'center' },
    sheet: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  });
