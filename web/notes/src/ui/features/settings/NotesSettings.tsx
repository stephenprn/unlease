/**
 * Carnet's part of the Réglages, in DESIGN's order as on the phone: its own section first (« Carnet »:
 * how the board lays out and the row under its search bar, where the reminders ring, the protected section and its password), then
 * cleaning the links already saved (a row of « Données »). The Keep import is the shell's « Importer »
 * row (`importer`, `KeepWizard`).
 */
import { useId, useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { isLockedNote } from '@unlease/notes/services/lock';
import { plural } from '@unlease/core/services/format';
import { APP_NAME } from '@unlease/notes/brand';
import { NOTES_SETTINGS_SECTION } from '@unlease/notes/services/settingsPlaces';

import { cleanSavedLinks, trackedLinkIds } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { setLayout, useLayout } from '../../../app/store/prefs';
import { BoardRowChoice } from './BoardRowChoice';
import { showUndo } from '@shared/app/store/ui';
import { isLockOpen, openLock, setLockSection, useLockState } from '@shared/app/lock';
import { Button } from '@shared/ui/components/Button';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { LockPasswordDialog } from '@shared/ui/features/lock/LockPasswordDialog';
import { Segmented } from '@shared/ui/components/Segmented';
import { Section } from '@shared/ui/features/settings/Section';
import styles from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';

/** The board's layout, the section's first: Mur or Liste. */
function BoardLayout() {
  const layout = useLayout();
  return (
    <div className={styles.block}>
      <p className="t-meta-strong">{t('Board')}</p>
      <Segmented
        label={t('Board layout')}
        value={layout}
        onChange={setLayout}
        options={[
          { value: 'wall', label: t('Wall'), icon: 'grid' },
          { value: 'list', label: t('List'), icon: 'rows' },
        ]}
      />
    </div>
  );
}

/** The protected notes' ids, live or in the bin. */
const lockedIds = (notes: ReturnType<typeof useLibraryStore.getState>['notes']): string[] =>
  Object.values(notes)
    .filter(note => note.deletedAt === null && isLockedNote(note))
    .map(note => note.id);

/**
 * Turning the section off while it holds notes: they go back among the others, in the same batch.
 * The lock shut, its password first: whoever holds the device cannot bring them out without it.
 */
function TurnOffForm({ count, onClose }: { count: number; onClose: () => void }) {
  const titleId = useId();
  const shut = !isLockOpen();
  const [password, setPassword] = useState('');
  const form = useForm({ password: shut && !password.trim() ? t('Type the password.') : null });
  const turnOff = async (): Promise<boolean> => {
    if (shut && !(await openLock(password))) {
      form.fail('password', t('This password doesn’t open the lock.'));
      return false;
    }
    const ids = lockedIds(useLibraryStore.getState().notes);
    setLockSection(
      false,
      ids.map(id => ({ type: 'note', id, patch: { locked: false } })),
    );
    onClose();
    return true;
  };
  return (
    <DialogFrame
      title={t('Turn off the protected section?')}
      titleId={titleId}
      onClose={onClose}
      onSubmit={form.onSubmit(turnOff)}
      foot={
        <>
          <FormMessage form={form} />
          <Button kind="text" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button kind="danger" type="submit" busy={form.busy}>
            {t('Turn off')}
          </Button>
        </>
      }
    >
      <p className="t-body">{t('Its notes go back among your others, where anyone holding this device sees them.')}</p>
      {count > 0 && shut ? (
        <TextField label={t('Password')} kind="secret" revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }} autoFocus value={password} onChange={setPassword} field={form.field('password')} />
      ) : null}
    </DialogFrame>
  );
}

/**
 * The protected section (`notes/services/lock`): on, a place in the navigation on every device, behind
 * the suite's one password (chosen first if there is none yet); off, its notes back among the others.
 */
function ProtectedRows() {
  const { check, section } = useLockState();
  const count = useLibraryStore(s => lockedIds(s.notes).length);
  const [dialog, setDialog] = useState<'choose' | 'change' | 'off' | null>(null);
  const close = (): void => setDialog(null);
  const toggle = (): void => {
    if (section) {
      if (count > 0) setDialog('off');
      else setLockSection(false);
    } else if (check === null) setDialog('choose');
    else setLockSection(true);
  };
  return (
    <>
      <button type="button" role="switch" aria-checked={section} className={styles.row} onClick={toggle}>
        <Icon name="lock" size={24} />
        <span className={styles.rowText}>
          <span className="t-body">{t('Protected section')}</span>
          <span className="t-meta">{t('Notes kept behind a password, out of the board, search and widgets.')}</span>
        </span>
        <SwitchMark checked={section} />
      </button>
      {check !== null ? (
        <button type="button" className={styles.row} onClick={() => setDialog('change')}>
          <Icon name="key" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Change the password')}</span>
            <span className="t-meta">{t('One password opens your protected notes in {notes} and your protected pages in {pages}, on every device.', { notes: APPS.notes.name, pages: APPS.pages.name })}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </button>
      ) : null}
      <LockPasswordDialog open={dialog === 'choose'} onClose={close} onSaved={() => setLockSection(true)} />
      <LockPasswordDialog open={dialog === 'change'} onClose={close} />
      <Layer open={dialog === 'off'} onDismiss={close} label={t('Turn off the protected section?')}>
        {dialog === 'off' ? <TurnOffForm count={count} onClose={close} /> : null}
      </Layer>
    </>
  );
}

/** Réglages' first section, as Agenda's « Agenda » and Contacts' « Contacts »: the board, where the reminders ring, then the protected section. */
function NotesSection() {
  return (
    <Section title={APP_NAME} id={NOTES_SETTINGS_SECTION}>
      <BoardLayout />
      <div className={styles.block}>
        <BoardRowChoice />
      </div>
      <div className={styles.row}>
        <Icon name="bell" size={24} />
        <span className={styles.rowText}>
          <span className="t-body">{t('Reminders ring on your phone')}</span>
          <span className="t-meta">{t('Here they are saved and shown; the Android app rings them at the set time.')}</span>
        </span>
      </div>
      <ProtectedRows />
    </Section>
  );
}

/** A row of « Données », as on the phone. */
function CleanLinksRow() {
  const tracked = useLibraryStore(s => trackedLinkIds(s.links).length);
  return tracked > 0 ? (
    <button
      type="button"
      className={styles.row}
      onClick={() => {
        const { count, undo } = cleanSavedLinks();
        showUndo(plural(count, 'link cleaned', 'links cleaned'), undo);
      }}
    >
      <Icon name="broom" size={24} />
      <span className={styles.rowText}>
        <span className="t-body">{t('Clean saved links')}</span>
        <span className="t-meta">{t('{links} tracking parameters (utm, fbclid…): they will be removed, the rest of the address is kept.', { links: plural(tracked, 'link keeps', 'links keep') })}</span>
      </span>
    </button>
  ) : (
    <div className={styles.row}>
      <Icon name="broom" size={24} />
      <span className={styles.rowText}>
        <span className="t-body">{t('Clean saved links')}</span>
        <span className="t-meta">{t('No tracking parameters in your links: new ones are cleaned as they arrive.')}</span>
      </span>
    </div>
  );
}

export const NOTES_SETTINGS: readonly SettingsSection[] = [
  { id: 'notes', Body: NotesSection },
  { id: 'links', Body: CleanLinksRow, place: 'data' },
];
