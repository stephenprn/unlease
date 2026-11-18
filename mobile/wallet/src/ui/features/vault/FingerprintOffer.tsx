/**
 * Opened by the passphrase on a phone that has a fingerprint or a screen lock: « Déverrouiller avec
 * l'empreinte la prochaine fois ? », once, over whatever screen the papers opened on.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { Dialog } from '@shared/ui/components';
import { dismissFingerprintOffer, enableFingerprint, useVaultStore } from '@app/store/vault';

export function FingerprintOffer() {
  const visible = useVaultStore(s => s.offerFingerprint);
  return (
    <Dialog
      visible={visible}
      title={t('Unlock with your fingerprint next time?')}
      message={t('Your papers will open with your fingerprint or your screen lock on this phone. A new fingerprint added later asks the passphrase again.')}
      confirmLabel={t('Use the fingerprint')}
      cancelLabel={t('Not now')}
      onCancel={dismissFingerprintOffer}
      onConfirm={() => {
        dismissFingerprintOffer();
        void enableFingerprint();
      }}
    />
  );
}
