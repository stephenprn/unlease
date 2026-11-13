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
      showSnack(!on ? t('Questions about the calendar turned on') : t('Questions about the calendar turned off'), undefined, { tone: 'success' });
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Setting refused'), undefined, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <ListRow
      icon="sparkle"
      title={t('“Ask Claude” about the calendar')}
      supporting={!keyed ? t('Add a Claude key first, above.') : on ? t('Claude answers from your events.') : t('Off: nothing from your calendar is sent to Claude.')}
      disabled={!keyed || busy}
      onPress={() => void flip()}
      trailing={<SwitchMark checked={on && keyed} />}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !keyed || busy }}
    />
  );
}
