/**
 * « Ajouter un rappel », or « Modifier le rappel » for one already set: Google's usual ones, for a
 * timed event or an all-day one; those the event already has are left out, the one being changed
 * ticked. A choice is the sheet's one act: it sets the reminder and closes. Réglages' default
 * reminders open it under their own name with « Aucun rappel » first (`onNone`), ticked while none is
 * set, a press clearing them.
 */
import React from 'react';

import { t } from '@unlease/core/i18n';
import { REMINDER_CHOICES, reminderWords } from '@unlease/calendar/services/eventText';

import { Icon, ListRow, Sheet, SheetScroll } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export interface ReminderSheetProps {
  readonly visible: boolean;
  readonly allDay: boolean;
  readonly chosen: readonly number[];
  /** The reminder being changed; null to add one. */
  readonly replacing?: number | null;
  readonly onDismiss: () => void;
  readonly onPick: (minutes: number) => void;
  /** Its title in place of « Ajouter un rappel » (Réglages: the setting's name). */
  readonly title?: string;
  /** « Aucun rappel » first: every reminder cleared. */
  readonly onNone?: () => void;
}

export function ReminderSheet({ visible, allDay, chosen, replacing = null, onDismiss, onPick, title, onNone }: ReminderSheetProps) {
  const theme = useTheme();
  const choices = allDay ? REMINDER_CHOICES.allDay : REMINDER_CHOICES.timed;
  const none = chosen.length === 0;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title ?? (replacing === null ? t('Add a reminder') : t('Edit the reminder'))}>
      <SheetScroll>
        {onNone ? (
          <ListRow
            title={t('No reminders')}
            icon="bellOff"
            trailing={none ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
            accessibilityState={{ checked: none }}
            onPress={() => {
              if (!none) onNone();
              onDismiss();
            }}
          />
        ) : null}
        {choices
          .filter(minutes => minutes === replacing || !chosen.includes(minutes))
          .map(minutes => {
            const current = minutes === replacing;
            return (
              <ListRow
                key={minutes}
                title={reminderWords(minutes, allDay)}
                icon="bell"
                trailing={current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
                accessibilityRole={replacing === null ? undefined : 'radio'}
                accessibilityState={replacing === null ? undefined : { checked: current }}
                onPress={() => {
                  if (!current) onPick(minutes);
                  onDismiss();
                }}
              />
            );
          })}
      </SheetScroll>
    </Sheet>
  );
}
