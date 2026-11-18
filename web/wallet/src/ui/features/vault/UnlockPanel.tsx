/**
 * Opening the vault in this browser: its passphrase, or, when it is lost, the recovery kit's code
 * (which then asks a new passphrase). Both tiers open together, for this visit. Inside a dialog that
 * already says « Verrouillé » (`bare`), it is the dialog's body: no panel of its own, no second title.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';

import { Button } from '@shared/ui/components/Button';
import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { unlockWithPassphrase, unlockWithRecovery } from '../../../app/store/vault';
import styles from '../../wallet.module.css';
import { NewPassphraseDialog } from './PassphraseDialogs';

export function UnlockPanel({ what, bare = false, onOpened }: { what: string; bare?: boolean; onOpened?: () => void }) {
  const titleId = useId();
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [typed, setTyped] = useState('');
  const [renew, setRenew] = useState(false);
  const form = useForm({ typed: typed.trim() ? null : mode === 'passphrase' ? t('Type the vault’s passphrase.') : t('Type the code from your recovery kit.') });

  const open = async (): Promise<void> => {
    const ok = mode === 'passphrase' ? await unlockWithPassphrase(typed) : await unlockWithRecovery(typed);
    if (!ok) {
      form.fail('typed', mode === 'passphrase' ? t('This passphrase doesn’t open the vault.') : t('This code doesn’t open the vault.'));
      return;
    }
    setTyped('');
    if (mode === 'recovery') setRenew(true);
    else onOpened?.();
  };

  const head = bare ? (
    what ? (
      <p className={`${styles.lockWords} t-body`}>{what}</p>
    ) : null
  ) : (
    <div className={styles.lockHead}>
      <span className={styles.lockPebble} data-pebble-under={1}>
        <Icon name="lock" size={24} />
      </span>
      <div>
        <h2 id={titleId} className="t-title">
          {t('Locked')}
        </h2>
        <p className={`${styles.lockWords} t-meta`}>{what}</p>
      </div>
    </div>
  );
  const body = (
    <>
      {head}
      <form className={styles.fields} onSubmit={form.onSubmit(open)}>
        <TextField
          label={mode === 'passphrase' ? t('Passphrase') : t('Recovery code')}
          type={mode === 'passphrase' ? 'password' : 'text'}
          autoComplete={mode === 'passphrase' ? 'current-password' : 'off'}
          autoCapitalize={mode === 'recovery' ? 'characters' : undefined}
          spellCheck={false}
          autoFocus
          value={typed}
          onChange={setTyped}
          field={form.field('typed')}
        />
        <div className={styles.lockActions}>
          <Button
            kind="text"
            small
            onClick={() => {
              setMode(mode === 'passphrase' ? 'recovery' : 'passphrase');
              setTyped('');
              form.reset();
            }}
          >
            {mode === 'passphrase' ? t('Passphrase forgotten?') : t('Use the passphrase')}
          </Button>
          <Button type="submit" icon="unlock" busy={form.busy}>
            {t('Unlock')}
          </Button>
        </div>
      </form>
      <NewPassphraseDialog
        open={renew}
        reason={t('You opened the vault with your recovery kit: choose a new passphrase for every device.')}
        onClose={() => {
          setRenew(false);
          onOpened?.();
        }}
      />
    </>
  );
  if (bare) return <div className={styles.lockBare}>{body}</div>;
  return (
    <OutlinedBox kind="panel" lift="raised" className={styles.lockPanel} role="region" aria-labelledby={titleId}>
      {body}
    </OutlinedBox>
  );
}
