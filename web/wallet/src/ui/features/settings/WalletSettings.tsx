/**
 * Wallet's Réglages in a browser: « Coffre » (when the papers lock again, keeping the cards open in
 * this browser, « Verrouiller maintenant », the passphrase, a new recovery kit) and « À la caisse »
 * (the barcode at the top of the page). The phone's own (the fingerprint, the screen's brightness)
 * are set on each phone.
 */
import { useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import type { LockAfter } from '@unlease/wallet/models/prefs';
import { TILL_SETTINGS_SECTION, VAULT_SETTINGS_SECTION } from '@unlease/wallet/services/settingsPlaces';

import { Button } from '@shared/ui/components/Button';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { Section } from '@shared/ui/features/settings/Section';
import settings from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';
import { setPrefs, usePrefsStore } from '../../../app/store/prefs';
import { lockVault, rememberedHere, setRememberCards, useVaultStatus } from '../../../app/store/vault';
import { NewKitDialog, NewPassphraseDialog } from '../vault/PassphraseDialogs';
import styles from '../../wallet.module.css';

function Toggle({ on, onChange, title, meta, icon, disabled }: { on: boolean; onChange: (on: boolean) => void; title: string; meta: string; icon: GlyphName; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={settings.row} onClick={() => onChange(!on)} disabled={disabled}>
      <Icon name={icon} size={24} />
      <span className={settings.rowText}>
        <span className="t-body">{title}</span>
        <span className="t-meta">{meta}</span>
      </span>
      <SwitchMark checked={on} />
    </button>
  );
}

function VaultSection() {
  const status = useVaultStatus();
  const lockAfter = usePrefsStore(s => s.lockAfter);
  const [remember, setRemember] = useState(rememberedHere);
  const [dialog, setDialog] = useState<'passphrase' | 'kit' | null>(null);
  const open = status === 'open';
  return (
    <Section title={t('Vault')} id={VAULT_SETTINGS_SECTION}>
      <div className={settings.block}>
        <p className="t-meta-strong">{t('Lock papers again')}</p>
        <Segmented<string>
          label={t('Lock papers again')}
          value={String(lockAfter)}
          onChange={value => setPrefs({ lockAfter: Number(value) as LockAfter })}
          options={[
            { value: '0', label: t('At once') },
            { value: '60', label: t('After 1 minute') },
            { value: '300', label: t('After 5 minutes') },
          ]}
        />
        <p className={`${settings.help} t-meta`}>{t('Once the tab is hidden; and after five minutes without a key or a click, whatever this says.')}</p>
      </div>
      <Toggle
        on={remember}
        icon="card"
        title={t('Keep cards open in this browser')}
        meta={t('Your cards show without the passphrase on this computer; papers always ask it. Only on a computer of your own.')}
        disabled={status === 'none' || (!remember && status === 'locked')}
        onChange={on => {
          setRemember(on);
          void setRememberCards(on);
        }}
      />
      <div className={`${settings.block} ${styles.vaultActions}`}>
        <Button kind="tonal" icon="lock" disabled={!open} onClick={lockVault}>
          {t('Lock now')}
        </Button>
        <Button kind="tonal" icon="key" disabled={!open} onClick={() => setDialog('passphrase')}>
          {t('Change the passphrase')}
        </Button>
        <Button kind="tonal" icon="shield" disabled={!open} onClick={() => setDialog('kit')}>
          {t('New recovery kit')}
        </Button>
      </div>
      {!open && status !== 'none' ? <p className={`${settings.help} t-meta`}>{t('Unlock the vault to change its passphrase or make a new recovery kit.')}</p> : null}
      <p className={`${settings.help} t-meta`}>{t('On a phone, {app} opens your papers with your fingerprint, and hides them from screenshots and the recent apps.', { app: APPS.wallet.name })}</p>
      <NewPassphraseDialog open={dialog === 'passphrase'} onClose={() => setDialog(null)} />
      <NewKitDialog open={dialog === 'kit'} onClose={() => setDialog(null)} />
    </Section>
  );
}

function TillSection() {
  const barcodeTop = usePrefsStore(s => s.barcodeTop);
  return (
    <Section title={t('At the till')} id={TILL_SETTINGS_SECTION}>
      <Toggle on={barcodeTop} onChange={on => setPrefs({ barcodeTop: on })} icon="barcode" title={t('Barcode at the top of the screen')} meta={t('Where a till’s scanner reaches it best on some counters.')} />
    </Section>
  );
}

export const WALLET_SETTINGS: readonly SettingsSection[] = [
  { id: 'wallet-vault', Body: VaultSection },
  { id: 'wallet-till', Body: TillSection },
];
