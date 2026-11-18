/**
 * The wallet's first run, once per server: what the vault is (sealed on your devices; the server,
 * Seafile and the backups hold only sealed bytes; Claude reads a paper only when you ask), its
 * passphrase typed twice with how strong it is, then the recovery kit, which must be kept before
 * going on. A server that has a vault already (another device made it meanwhile) is opened instead.
 */
import { useId, useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { passphraseStrength } from '@unlease/wallet/services/passphrase';

import { showError } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Switch } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { kitKept, makeVault, useVaultStore } from '../../../app/store/vault';
import styles from '../../wallet.module.css';
import { RecoveryKit } from './RecoveryKit';

const STRENGTH_WORDS = { weak: tx('Too easy to guess'), fair: tx('Could be stronger'), good: tx('Strong') } as const;

export function StrengthMeter({ passphrase }: { passphrase: string }) {
  const reading = passphraseStrength(passphrase);
  if (!passphrase) return null;
  return (
    <div className={`${styles.strength} t-meta`} aria-live="polite">
      <div className={styles.strengthTrack} aria-hidden="true">
        <div className={styles.strengthFill} data-level={reading.level} style={{ transform: `scaleX(${Math.max(0.06, reading.score)})` }} />
      </div>
      <span>{reading.tooShort ? t('At least 12 characters') : t(STRENGTH_WORDS[reading.level])}</span>
    </div>
  );
}

export function VaultIntro() {
  const titleId = useId();
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const reading = passphraseStrength(passphrase);
  const form = useForm({
    passphrase: reading.tooShort ? t('At least 12 characters: a few words of your own are easiest to remember.') : reading.level === 'weak' ? t('Too easy to guess: add a word or two.') : null,
    again: again !== passphrase ? t('The two passphrases differ.') : null,
  });

  const create = async (): Promise<void> => {
    try {
      const made = await makeVault(passphrase);
      if (made === 'taken') {
        showError(t('Another device made this server’s vault meanwhile: open it with its passphrase.'));
        return;
      }
      // Made: the place shows the recovery kit next (`KitStep`), held by the vault until it is kept.
    } catch {
      form.fail(null, t('The vault couldn’t be made: check the connection to your server.'));
    }
  };

  return (
    <OutlinedBox kind="panel" lift="card" className={styles.intro} role="region" aria-labelledby={titleId}>
      <h2 id={titleId} className="t-title">
        {t('Your vault')}
      </h2>
      <ul className={styles.introList}>
        <li className={`${styles.introRow} t-body`}>
          <Icon name="lock" size={20} />
          <span>{t('Your cards and papers are encrypted on your devices before they leave them. Your server, Seafile and the backups only ever hold sealed bytes.')}</span>
        </li>
        <li className={`${styles.introRow} t-body`}>
          <Icon name="key" size={20} />
          <span>{t('A passphrase opens them, on each device once; on a phone, your fingerprint then.')}</span>
        </li>
        <li className={`${styles.introRow} t-body`}>
          <Icon name="sparkle" size={20} />
          <span>{t('Claude reads a paper only when you ask it to fill in its fields, and nothing of it is kept.')}</span>
        </li>
      </ul>
      <form className={styles.fields} onSubmit={form.onSubmit(create)}>
        <TextField label={t('Passphrase')} type="password" autoComplete="new-password" value={passphrase} onChange={setPassphrase} field={form.field('passphrase')} help={<StrengthMeter passphrase={passphrase} />} />
        <TextField label={t('Passphrase again')} type="password" autoComplete="new-password" value={again} onChange={setAgain} field={form.field('again')} />
        <div className={styles.lockActions}>
          <span className="t-meta">{form.message}</span>
          <Button type="submit" icon="lock" busy={form.busy}>
            {t('Make the vault')}
          </Button>
        </div>
      </form>
    </OutlinedBox>
  );
}

/** The recovery kit of a vault just made here, shown once, until the person says it is kept: whatever the place, it is this. */
export function KitStep() {
  const titleId = useId();
  const code = useVaultStore(s => s.pendingKit);
  const [kept, setKept] = useState(false);
  if (!code) return null;
  return (
    <OutlinedBox kind="panel" lift="card" className={styles.intro} role="region" aria-labelledby={titleId}>
      <h2 id={titleId} className="t-title">
        {t('Your recovery kit')}
      </h2>
      <p className="t-body">{t('If you forget the passphrase, this code is the only way back into your papers. Print it or save it somewhere safe and apart from your devices: it is shown this once.')}</p>
      <RecoveryKit code={code} />
      <Switch checked={kept} onChange={setKept} label={t('I’ve kept my recovery kit')} />
      <div className={styles.lockActions}>
        <span />
        <Button icon="check" disabled={!kept} onClick={kitKept}>
          {t('Continue')}
        </Button>
      </div>
    </OutlinedBox>
  );
}
