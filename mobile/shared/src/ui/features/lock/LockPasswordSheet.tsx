/**
 * Choosing the suite's lock password, or changing it: typed twice, at least `LOCK_PASSWORD_MIN`
 * characters. A change while the lock is shut asks the current one first, unless the server's token
 * just stood for it (`trusted`). What the lock does and does not do is said once, plainly.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { LOCK_PASSWORD_MIN } from '@unlease/core/services/lock';
import { SHAPES } from '@unlease/design/shapes';
import { isLockOpen, openLock, setLockPassword, useLockState } from '@shared/app/lock';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, Icon, Organic, Sheet, SheetScroll, TextField } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import { corners } from '@shared/ui/theme/shape';
import type { Theme } from '@shared/ui/theme/theme';

interface Props {
  readonly visible: boolean;
  /** Why it is asked now (« Choisissez le mot de passe qui protégera cette page. »). */
  readonly reason?: string;
  readonly onDismiss: () => void;
  /** Called once the password is saved, the lock open. */
  readonly onSaved?: () => void;
  /** The server's token stood for the current password: no need to type it. */
  readonly trusted?: boolean;
}

export function LockPasswordSheet({ visible, reason, onDismiss, onSaved, trusted = false }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { check } = useLockState();
  const changing = check !== null;
  const askCurrent = changing && !trusted && !isLockOpen();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const currentProblem = askCurrent && !current.trim() ? t('Type the current password.') : refused ? t('This password doesn’t open the lock.') : null;
  const problem = password.trim().length < LOCK_PASSWORD_MIN ? t('At least {count} characters.', { count: LOCK_PASSWORD_MIN }) : null;
  const differ = again !== password ? t('The two passwords differ.') : null;

  const close = (): void => {
    setCurrent('');
    setPassword('');
    setAgain('');
    setSent(false);
    setRefused(false);
    onDismiss();
  };
  const save = async (): Promise<void> => {
    setSent(true);
    if ((askCurrent && !current.trim()) || problem || differ) return;
    setBusy(true);
    try {
      if (askCurrent && !(await openLock(current))) {
        setRefused(true);
        return;
      }
      await setLockPassword(password);
      showSnack(changing ? t('Password changed on every device') : t('Password set on every device'), undefined, { tone: 'success' });
      close();
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onDismiss={close} title={changing ? t('Change the password') : t('Choose a password')} keepsKeyboard>
      <SheetScroll contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AppText variant="body">{reason ?? t('One password opens your protected notes in {notes} and your protected pages in {pages}, on every device.', { notes: APPS.notes.name, pages: APPS.pages.name })}</AppText>
        {askCurrent ? (
          <TextField
            label={t('Current password')}
            kind="secret"
            revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }}
            value={current}
            onChangeText={value => {
              setCurrent(value);
              setRefused(false);
            }}
            error={sent || refused ? currentProblem : null}
          />
        ) : null}
        <TextField
          label={changing ? t('New password') : t('Password')}
          kind="secret"
          revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }}
          value={password}
          onChangeText={setPassword}
          error={sent ? problem : null}
        />
        <TextField label={t('Password again')} kind="secret" revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }} value={again} onChangeText={setAgain} error={sent ? differ : null} />
        {changing ? null : (
          <Organic style={[styles.honest, corners(SHAPES.small)]}>
            <Icon name="info" size={18} color={theme.color.inkMuted} />
            <AppText variant="meta" style={styles.honestWords}>
              {t('It hides, it does not encrypt: it keeps your notes and pages from whoever holds your phone or your browser, not from whoever reads your server. Forgotten, your server’s token lets you choose another.')}
            </AppText>
          </Organic>
        )}
        <View style={styles.foot}>
          <Button kind="text" label={t('Cancel')} onPress={close} />
          <Button icon="check" label={t('Save')} busy={busy} onPress={() => void save()} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    body: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
    honest: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: theme.color.paperHigh },
    honestWords: { flex: 1 },
    foot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  });
}
