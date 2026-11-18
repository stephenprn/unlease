/** A new passphrase, typed twice with its strength: every device asks it from then on (a phone's fingerprint goes on working). */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { passphraseStrength } from '@unlease/wallet/services/passphrase';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, Sheet, SheetScroll, TextField } from '@shared/ui/components';
import { changePassphrase } from '@app/store/vault';

import { StrengthMeter } from './StrengthMeter';

export function passphraseProblem(passphrase: string): string | null {
  const reading = passphraseStrength(passphrase);
  if (reading.tooShort) return t('At least 12 characters: a few words of your own are easiest to remember.');
  return reading.level === 'weak' ? t('Too easy to guess: add a word or two.') : null;
}

export function PassphraseSheet({ visible, reason, onDismiss }: { visible: boolean; reason?: string; onDismiss: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = passphraseProblem(passphrase);
  const differ = again !== passphrase ? t('The two passphrases differ.') : null;
  const save = async (): Promise<void> => {
    setSent(true);
    if (problem || differ) return;
    setBusy(true);
    try {
      await changePassphrase(passphrase);
      showSnack(t('Passphrase changed on every device'), undefined, { tone: 'success' });
      setPassphrase('');
      setAgain('');
      setSent(false);
      onDismiss();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Change the passphrase')} keepsKeyboard>
      <SheetScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {reason ? <AppText variant="body">{reason}</AppText> : null}
        <TextField label={t('New passphrase')} value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" autoCorrect={false} error={sent ? problem : null} help={<StrengthMeter passphrase={passphrase} />} />
        <TextField label={t('Passphrase again')} value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoCorrect={false} error={sent ? differ : null} />
        <View style={styles.foot}>
          <Button kind="text" label={t('Cancel')} onPress={onDismiss} />
          <Button icon="check" label={t('Save')} busy={busy} onPress={() => void save()} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  foot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
