/**
 * At the head of the calendar, only while Android keeps Agenda's notifications from showing (refused
 * in its settings): one quiet line, the alert glyph in Safran, « Autoriser » in link ink, a press
 * opening the page that allows them. Read again whenever the app comes back to the front, since the
 * answer changes in Android's settings. Réglages' « Notifications à l'heure » says the rest.
 */
import React, { memo, useEffect, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import { SHAPES } from '@unlease/design/shapes';
import { later } from '@app/later';
import { openReminderSetting, remindersHealth } from '@shared/platform/reminders';

import { AppText, Icon, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Whether the notifications are refused, read again whenever the app comes back. */
function useNotificationsRefused(): boolean {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let live = true;
    const read = (): void => {
      remindersHealth().then(
        health => live && setRefused(!health.notifications),
        () => undefined,
      );
    };
    read();
    const back = AppState.addEventListener('change', state => state === 'active' && read());
    return () => {
      live = false;
      back.remove();
    };
  }, []);
  return refused;
}

function NotificationsLineComponent() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const refused = useNotificationsRefused();
  if (!refused) return null;
  return (
    <Tappable
      onPress={() => later(openReminderSetting('notifications'))}
      style={styles.line}
      accessibilityRole="button"
      accessibilityLabel={t('Reminders won’t show')}
      accessibilityHint={t('Allow them in Android’s settings: without them, nothing shows.')}
    >
      <Icon name="alert" size={18} color={theme.color.waiting} />
      <AppText variant="meta" color={theme.color.ink} style={styles.words}>
        {t('Reminders won’t show')}
      </AppText>
      <AppText variant="label" color={theme.color.link}>
        {t('Allow')}
      </AppText>
    </Tappable>
  );
}

export const NotificationsLine = memo(NotificationsLineComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    // Clock's quiet line, number for number: on the bar's edge, its press inside its own corners.
    line: { marginHorizontal: 12, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 48, ...corners(SHAPES.tab) },
    words: { flex: 1 },
  });
