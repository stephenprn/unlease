/**
 * « Questions sur l'agenda »: whether « Demander à Claude » may read the calendar (off until turned on
 * here, and only with Claude's key): the events from three months back to a year ahead, built on the
 * phone, nothing else.
 */
import React, { useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { AdminState } from '@shared/app/hooks/useAdmin';
import { selectReading, useSettingsStore, type ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { saveServerSettings } from '@shared/app/sync/transport';

import { ListRow, SwitchMark } from '@shared/ui/components';

export { ASK_INFO, askLine } from '@unlease/calendar/services/admin';

export function AskSection({ server, admin }: { server: ServerConfig; admin: AdminState }) {
  const on = admin.settings!.calendar.ask;
  const keyed = useSettingsStore(selectReading) === true;
  const [busy, setBusy] = useState(false);
  const flip = async (): Promise<void> => {
    setBusy(true);
    try {
      admin.setSettings(await saveServerSettings(server, { calendar: { ask: !on } }));
      showSnack(!on ? t('Questions sur l’agenda activées') : t('Questions sur l’agenda désactivées'), undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Réglage refusé'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <ListRow
      icon="sparkle"
      title={t('« Demander à Claude » sur l’agenda')}
      supporting={!keyed ? t('Ajoutez d’abord une clé Claude, plus haut.') : on ? t('Claude répond d’après vos événements.') : t('Désactivé : rien de votre agenda n’est envoyé à Claude.')}
      disabled={!keyed || busy}
      onPress={() => void flip()}
      trailing={<SwitchMark checked={on && keyed} />}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !keyed || busy }}
    />
  );
}
