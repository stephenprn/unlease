/**
 * Réglages' « Résumé du matin » (`services/digest`): on or off (off at first: a notification is asked
 * for, never imposed), the time it rings, and whether a day with nothing says so. Armed by Agenda's
 * book (`app/reminders.ts`) as soon as the prefs change.
 */
import React, { useState } from 'react';

import { t } from '@unlease/core/i18n';
import { DIGEST_TIMES } from '@unlease/calendar/services/digest';
import { clockWords } from '@unlease/calendar/services/eventText';
import { selectPrefs, setPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { later } from '@app/later';
import { ensurePermission } from '@platform/notifications';

import { Icon, ListRow, Sheet, SheetScroll } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { Section } from '@shared/ui/features/settings/Section';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export function DigestSection() {
  const theme = useTheme();
  const prefs = useCalendarUiStore(selectPrefs);
  const [picking, setPicking] = useState(false);
  const turn = (digest: boolean): void => {
    setPrefs({ digest });
    if (digest) later(ensurePermission());
  };
  return (
    <Section title={t('Morning summary')}>
      <SwitchRow title={t('Morning summary')} supporting={t('Your day in one notification each morning: events, birthdays, reminders and pages.')} value={prefs.digest} onChange={turn} />
      {prefs.digest ? (
        <>
          <ListRow icon="clock" title={t('At')} supporting={clockWords(prefs.digestAt, prefs.twelveHours)} onPress={() => setPicking(true)} />
          <SwitchRow title={t('Even on days with nothing')} supporting={t('Says so when the day holds nothing.')} value={prefs.digestEmpty} onChange={digestEmpty => setPrefs({ digestEmpty })} />
        </>
      ) : null}
      <Sheet visible={picking} onDismiss={() => setPicking(false)} title={t('Morning summary')}>
        <SheetScroll>
          {DIGEST_TIMES.map(time => {
            const current = time === prefs.digestAt;
            return (
              <ListRow
                key={time}
                title={clockWords(time, prefs.twelveHours)}
                trailing={current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
                accessibilityRole="radio"
                accessibilityState={{ checked: current }}
                onPress={() => {
                  setPrefs({ digestAt: time });
                  setPicking(false);
                }}
              />
            );
          })}
        </SheetScroll>
      </Sheet>
    </Section>
  );
}
