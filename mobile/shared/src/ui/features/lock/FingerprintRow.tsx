/**
 * The lock's fingerprint on this phone, as a settings row: Carnet's (under its protected section) and
 * Pages' (« Pages protégées »). Shown once a password is set and the phone can read a fingerprint or
 * its screen lock. Turned on, it keeps the password's stamp behind the fingerprint, which the lock
 * must be open for (the password typed here, a moment ago); the offer after a password unlock
 * (`FingerprintOffer`) asks only once, so this is the way back to it.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { disableFingerprint, enableFingerprint, fingerprintReady, isLockOpen, useFingerprintOn, useLockState } from '@shared/app/lock';
import { showSnack } from '@shared/app/store/uiStore';

import { SwitchRow } from '../appearance/SwitchRow';

/** `openFirst`: what to open with the password before (the app's own words: its section, a page). */
export function FingerprintRow({ openFirst }: { readonly openFirst: string }) {
  const { check } = useLockState();
  const fingerprint = useFingerprintOn();
  if (!check || !(fingerprint || fingerprintReady())) return null;
  return (
    <SwitchRow
      icon="fingerprint"
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
          showSnack(openFirst, undefined, { tone: 'warning' });
          return;
        }
        void enableFingerprint();
      }}
    />
  );
}
