/**
 * The wallet's first run, once per server: what the vault is, its passphrase typed twice with how
 * strong it is, then the recovery kit, kept before going on. A server that has a vault already
 * (another device made it meanwhile) is opened instead.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, Icon, ListRow, Organic, Switch, TextField } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { enableFingerprint, fingerprintOffered, kitKept, makeVault, useVaultStore } from '@app/store/vault';

import { passphraseProblem } from './PassphraseSheet';
import { RecoveryKit } from './RecoveryKit';
import { StrengthMeter } from './StrengthMeter';

type Input = React.ComponentRef<typeof TextInput>;

function Point({ icon, text }: { icon: GlyphName; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.point}>
      <Icon name={icon} size={20} color={theme.color.inkMuted} />
      <AppText variant="body" style={styles.pointText}>
        {text}
      </AppText>
    </View>
  );
}

export function VaultIntro() {
  const themed = useThemedStyles(makeStyles);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const second = useRef<Input>(null);
  const problem = passphraseProblem(passphrase);
  const differ = again !== passphrase ? t('The two passphrases differ.') : null;

  const create = async (): Promise<void> => {
    setSent(true);
    if (problem || differ) return;
    setBusy(true);
    try {
      const made = await makeVault(passphrase);
      if (made === 'taken') showSnack(t('Another device made this server’s vault meanwhile: open it with its passphrase.'), undefined, { tone: 'warning' });
      // Made: the home shows the recovery kit next (`KitStep`), held by the vault until it is kept.
    } catch {
      showSnack(t('The vault couldn’t be made: check the connection to your server.'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Organic outline="panel" style={themed.panel}>
      <AppText variant="title" accessibilityRole="header">
        {t('Your vault')}
      </AppText>
      <Point icon="lock" text={t('Your cards and papers are encrypted on your devices before they leave them. Your server, Seafile and the backups only ever hold sealed bytes.')} />
      <Point icon="fingerprint" text={t('A passphrase opens them, on each device once; on a phone, your fingerprint then.')} />
      <Point icon="sparkle" text={t('Claude reads a paper only when you ask it to fill in its fields, and nothing of it is kept.')} />
      <TextField label={t('Passphrase')} value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" autoCorrect={false} error={sent ? problem : null} help={<StrengthMeter passphrase={passphrase} />} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => second.current?.focus()} />
      <TextField ref={second} label={t('Passphrase again')} value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoCorrect={false} error={sent ? differ : null} returnKeyType="go" onSubmitEditing={() => void create()} />
      <Button icon="lock" label={t('Make the vault')} busy={busy} onPress={() => void create()} />
    </Organic>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointText: { flex: 1 },
});

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    panel: { marginHorizontal: 12, marginTop: 8, padding: 20, gap: 14, backgroundColor: theme.color.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    // The row's own inset given back, so its words line up with the panel's.
    kept: { marginHorizontal: -16 },
  });
}

/**
 * The recovery kit of a vault just made here, shown once, until the person says it is kept: whatever
 * the home shows meanwhile, it is this.
 */
export function KitStep() {
  const themed = useThemedStyles(makeStyles);
  const code = useVaultStore(s => s.pendingKit);
  const [kept, setKept] = useState(false);
  if (!code) return null;
  return (
    <Organic outline="panel" style={themed.panel}>
      <AppText variant="title" accessibilityRole="header">
        {t('Your recovery kit')}
      </AppText>
      <AppText variant="body">{t('If you forget the passphrase, this code is the only way back into your papers. Print it or save it somewhere safe and apart from your devices: it is shown this once.')}</AppText>
      <RecoveryKit code={code} />
      <View style={themed.kept}>
        <ListRow title={t('I’ve kept my recovery kit')} trailing={<Switch value={kept} onValueChange={setKept} accessibilityLabel={t('I’ve kept my recovery kit')} />} accessibilityRole="switch" accessibilityState={{ checked: kept }} onPress={() => setKept(!kept)} />
      </View>
      <Button
        icon="check"
        label={t('Continue')}
        disabled={!kept}
        onPress={() => {
          kitKept();
          if (fingerprintOffered()) void enableFingerprint();
        }}
      />
    </Organic>
  );
}
