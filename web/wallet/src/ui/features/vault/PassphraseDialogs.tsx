/**
 * The vault's two keys a person holds, changed from Réglages: a new passphrase (typed twice, its
 * strength shown; every device asks it from then on, a phone's fingerprint goes on working), and a
 * new recovery kit (the old code opens nothing once it syncs). Both need the vault open.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { passphraseStrength } from '@unlease/wallet/services/passphrase';

import { showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Layer } from '@shared/ui/components/Layer';
import { Switch } from '@shared/ui/components/Checkbox';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { changePassphrase, renewRecovery } from '../../../app/store/vault';
import styles from '../../wallet.module.css';
import { RecoveryKit } from './RecoveryKit';
import { StrengthMeter } from './VaultIntro';

function PassphraseForm({ reason, onClose }: { reason?: string; onClose: () => void }) {
  const titleId = useId();
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const reading = passphraseStrength(passphrase);
  const form = useForm({
    passphrase: reading.tooShort ? t('At least 12 characters: a few words of your own are easiest to remember.') : reading.level === 'weak' ? t('Too easy to guess: add a word or two.') : null,
    again: again !== passphrase ? t('The two passphrases differ.') : null,
  });
  const save = async (): Promise<void> => {
    await changePassphrase(passphrase);
    showSnack(t('Passphrase changed on every device'), undefined, { tone: 'success' });
    onClose();
  };
  return (
    <DialogFrame
      title={t('Change the passphrase')}
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
        {reason ? <p className="t-body">{reason}</p> : null}
        <TextField label={t('New passphrase')} type="password" autoComplete="new-password" autoFocus value={passphrase} onChange={setPassphrase} field={form.field('passphrase')} help={<StrengthMeter passphrase={passphrase} />} />
        <TextField label={t('Passphrase again')} type="password" autoComplete="new-password" value={again} onChange={setAgain} field={form.field('again')} />
      </div>
    </DialogFrame>
  );
}

export function NewPassphraseDialog({ open, reason, onClose }: { open: boolean; reason?: string; onClose: () => void }) {
  return (
    <Layer open={open} onDismiss={onClose} label={t('Change the passphrase')}>
      {open ? <PassphraseForm reason={reason} onClose={onClose} /> : null}
    </Layer>
  );
}

function KitForm({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const [code, setCode] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const make = async (): Promise<void> => {
    setBusy(true);
    try {
      setCode(await renewRecovery());
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      title={t('New recovery kit')}
      titleId={titleId}
      onClose={code && !kept ? undefined : onClose}
      foot={
        code ? (
          <Button icon="check" disabled={!kept} onClick={onClose}>
            {t('Done')}
          </Button>
        ) : (
          <>
            <Button kind="text" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button icon="shield" busy={busy} onClick={() => void make()}>
              {t('Make a new kit')}
            </Button>
          </>
        )
      }
    >
      <div className={styles.fields}>
        {code ? (
          <>
            <p className="t-body">{t('Your old kit no longer opens the vault. Keep this one somewhere safe, apart from your devices: it is shown this once.')}</p>
            <RecoveryKit code={code} />
            <Switch checked={kept} onChange={setKept} label={t('I’ve kept my recovery kit')} />
          </>
        ) : (
          <p className="t-body">{t('A new code to open the vault if the passphrase is lost. The old kit stops working on every device: make one if it was lost or someone saw it.')}</p>
        )}
      </div>
    </DialogFrame>
  );
}

export function NewKitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Layer open={open} onDismiss={onClose} label={t('New recovery kit')}>
      {open ? <KitForm onClose={onClose} /> : null}
    </Layer>
  );
}
