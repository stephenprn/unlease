/**
 * Choosing the suite's lock password, or changing it: typed twice, at least `LOCK_PASSWORD_MIN`
 * characters. A change while the lock is shut asks the current one first, unless the server's token
 * just stood for it (`trusted`). What the lock does and does not do is said once, plainly.
 */
import { useId, useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { LOCK_PASSWORD_MIN } from '@unlease/core/services/lock';

import { isLockOpen, openLock, setLockPassword, useLockState } from '../../../app/lock';
import { showSnack } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { FormMessage } from '../../components/FormMessage';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import styles from './lock.module.css';

interface Props {
  readonly open: boolean;
  /** Why it is asked now (« Choisissez le mot de passe qui protégera cette page. »). */
  readonly reason?: string;
  readonly onClose: () => void;
  /** Called once the password is saved, the lock open. */
  readonly onSaved?: () => void;
  /** The server's token stood for the current password: no need to type it. */
  readonly trusted?: boolean;
}

function PasswordForm({ reason, onClose, onSaved, trusted }: Omit<Props, 'open'>) {
  const titleId = useId();
  const { check } = useLockState();
  const changing = check !== null;
  const askCurrent = changing && !trusted && !isLockOpen();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const form = useForm({
    current: askCurrent && !current.trim() ? t('Type the current password.') : null,
    password: password.trim().length < LOCK_PASSWORD_MIN ? t('At least {count} characters.', { count: LOCK_PASSWORD_MIN }) : null,
    again: again !== password ? t('The two passwords differ.') : null,
  });
  const save = async (): Promise<boolean> => {
    if (askCurrent && !(await openLock(current))) {
      form.fail('current', t('This password doesn’t open the lock.'));
      return false;
    }
    await setLockPassword(password);
    showSnack(changing ? t('Password changed on every device') : t('Password set on every device'), undefined, { tone: 'success' });
    onClose();
    onSaved?.();
    return true;
  };
  const title = changing ? t('Change the password') : t('Choose a password');
  return (
    <DialogFrame
      title={title}
      titleId={titleId}
      onClose={onClose}
      onSubmit={form.onSubmit(save)}
      foot={
        <>
          <FormMessage form={form} />
          <Button kind="text" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" icon="check" busy={form.busy}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className={styles.fields}>
        <p className={`${styles.lead} t-body`}>{reason ?? t('One password opens your protected notes in {notes} and your protected pages in {pages}, on every device.', { notes: APPS.notes.name, pages: APPS.pages.name })}</p>
        {askCurrent ? (
          <TextField
            label={t('Current password')}
            kind="secret"
            revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }}
            autoFocus
            value={current}
            onChange={setCurrent}
            field={form.field('current')}
          />
        ) : null}
        <TextField
          label={changing ? t('New password') : t('Password')}
          kind="secret"
          revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }}
          autoFocus={!askCurrent}
          value={password}
          onChange={setPassword}
          field={form.field('password')}
        />
        <TextField label={t('Password again')} kind="secret" revealLabels={{ show: t('Show the password'), hide: t('Hide the password') }} value={again} onChange={setAgain} field={form.field('again')} />
        {changing ? null : (
          <p className={`${styles.honest} t-meta`}>
            <Icon name="info" size={18} />
            <span>{t('It hides, it does not encrypt: it keeps your notes and pages from whoever holds your phone or your browser, not from whoever reads your server. Forgotten, your server’s token lets you choose another.')}</span>
          </p>
        )}
      </div>
    </DialogFrame>
  );
}

export function LockPasswordDialog({ open, ...props }: Props) {
  return (
    <Layer open={open} onDismiss={props.onClose} label={t('Choose a password')}>
      {open ? <PasswordForm {...props} /> : null}
    </Layer>
  );
}
