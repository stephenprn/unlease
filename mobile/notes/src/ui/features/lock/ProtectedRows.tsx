/**
 * Réglages' rows for the protected section, under Carnet's own: the section on or off (on every
 * device: it is the lock's record), the password changed, and on a phone that can, the fingerprint.
 * Turned on with no password yet, the password is chosen first. Turned off while it holds notes, the
 * lock must be open (its password is asked in the confirmation), and the notes go back among the
 * others in the same batch as the switch.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { isLockedNote } from '@unlease/notes/services/lock';
import { disableFingerprint, enableFingerprint, fingerprintReady, isLockOpen, openLock, setLockSection, useFingerprintOn, useLockState } from '@shared/app/lock';
import { showSnack } from '@shared/app/store/uiStore';
import { LockPasswordSheet } from '@shared/ui/features/lock';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { useLibraryStore } from '@app/store/libraryStore';

import { Dialog, ListRow, TextField } from '../../components';

/** Every protected note not deleted for good, the bin's included: all go back when the section is turned off. */
const lockedIds = (): string[] => {
  const { notes, noteOrder } = useLibraryStore.getState();
  return noteOrder.filter(id => {
    const note = notes[id];
    return !!note && note.deletedAt === null && isLockedNote(note);
  });
};

export function ProtectedRows() {
  const { check, section } = useLockState();
  const fingerprint = useFingerprintOn();
  const [choosing, setChoosing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // Asked once the dialog opens: the lock may have shut since the row was drawn.
  const [askPassword, setAskPassword] = useState(false);

  const turn = (on: boolean): void => {
    if (on) {
      if (check) setLockSection(true);
      else setChoosing(true);
      return;
    }
    if (lockedIds().length === 0) {
      setLockSection(false);
      return;
    }
    setPassword('');
    setProblem(null);
    setAskPassword(!isLockOpen());
    setTurningOff(true);
  };

  const turnOff = async (): Promise<void> => {
    if (askPassword) {
      if (!password.trim()) {
        setProblem(t('Type the password.'));
        return;
      }
      if (!(await openLock(password))) {
        setProblem(t('This password doesn’t open the lock.'));
        return;
      }
    }
    const ids = lockedIds();
    setLockSection(
      false,
      ids.map(id => ({ type: 'note', id, patch: { locked: false } })),
    );
    setTurningOff(false);
    showSnack(ids.length > 1 ? t('Notes back among your notes') : t('Note back among your notes'), undefined, { tone: 'success' });
  };

  return (
    <>
      <SwitchRow title={t('Protected section')} supporting={t('Notes kept behind a password, out of the board, search and widgets.')} value={section} onChange={turn} />
      {check ? <ListRow icon="key" title={t('Change the password')} onPress={() => setChanging(true)} /> : null}
      {check && (fingerprint || fingerprintReady()) ? (
        <SwitchRow
          title={t('Unlock with your fingerprint')}
          supporting={t('On this phone, instead of the password.')}
          value={fingerprint}
          onChange={on => {
            if (!on) {
              disableFingerprint();
              return;
            }
            // The fingerprint stands for a password typed here: the lock must be open to keep it.
            if (!isLockOpen()) {
              showSnack(t('Unlock the protected section with the password first.'), undefined, { tone: 'warning' });
              return;
            }
            void enableFingerprint();
          }}
        />
      ) : null}

      <LockPasswordSheet
        visible={choosing}
        reason={t('Choose the password that keeps your protected notes.')}
        onDismiss={() => setChoosing(false)}
        onSaved={() => setLockSection(true)}
      />
      <LockPasswordSheet visible={changing} onDismiss={() => setChanging(false)} />
      <Dialog
        visible={turningOff}
        title={t('Turn off the protected section?')}
        message={t('Its notes go back among your others, where anyone holding this device sees them.')}
        confirmLabel={t('Turn off')}
        onCancel={() => setTurningOff(false)}
        onConfirm={() => void turnOff()}
      >
        {askPassword ? (
          <View style={styles.field}>
            <TextField
              label={t('Password')}
              kind="secret"
              revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }}
              value={password}
              onChangeText={value => {
                setPassword(value);
                setProblem(null);
              }}
              error={problem}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={() => void turnOff()}
            />
          </View>
        ) : null}
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  field: { paddingTop: 4 },
});
