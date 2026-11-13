/**
 * The switch of an app's mirror into the phone's own (`@shared/app/phoneMirror`), in its Réglages:
 * the switch with what it does, then, only while it lasts, what holds it back (Android refused the
 * permissions: a row opening the app's page in Android's settings; a copy that failed). Nothing where
 * the app has no mirror (an older native build).
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import type { PhoneMirror } from '@shared/app/phoneMirror';
import { openMirrorSettings } from '@shared/platform/phoneMirror';

import { ListRow } from '../../components';
import { SwitchRow } from '../appearance/SwitchRow';

export interface PhoneMirrorRowsProps {
  readonly mirror: PhoneMirror;
  readonly title: string;
  readonly supporting: string;
}

export function PhoneMirrorRows({ mirror, title, supporting }: PhoneMirrorRowsProps): React.ReactElement | null {
  const { status, failed } = mirror.useStatus();
  if (status === 'unavailable') return null;
  return (
    <>
      <SwitchRow title={title} supporting={supporting} value={status !== 'off'} onChange={on => void mirror.turn(on).catch(() => undefined)} />
      {status === 'denied' ? (
        <ListRow icon="alert" title={t('Permission refused')} supporting={t('Android refused access: tap here, then under “Permissions”, allow it.')} onPress={openMirrorSettings} />
      ) : null}
      {status === 'on' && failed ? <ListRow icon="alert" title={t('The last copy didn’t go through')} supporting={t('It’s tried again at the next change.')} /> : null}
    </>
  );
}
