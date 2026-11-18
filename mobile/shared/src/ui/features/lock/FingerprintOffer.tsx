/**
 * Opened by the password on a phone that has a fingerprint or a screen lock: « Déverrouiller avec
 * l'empreinte la prochaine fois ? », once, over whatever screen the lock opened on. Mounted once at
 * the app's root by the apps that lock something.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { dismissFingerprintOffer, enableFingerprint, useFingerprintOffer } from '@shared/app/lock';
import { Dialog } from '@shared/ui/components';

export function FingerprintOffer() {
  const visible = useFingerprintOffer();
  return (
    <Dialog
      visible={visible}
      title={t('Unlock with your fingerprint next time?')}
      message={t('Your protected notes and pages will open with your fingerprint or your screen lock on this phone. A new fingerprint added later asks the password again.')}
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
