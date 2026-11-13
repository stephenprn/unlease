/**
 * Every birthday of the year to come, the nearest first, grouped as Google does and as the web: today,
 * this week, then month by month. Today's say « Souhaiter » at their end (the wish written into an
 * SMS, WhatsApp or an e-mail, `WishSheet`) when there is a way to write to them.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { ageToday, birthdayGroups, birthdayWhen, formatBirthday } from '@unlease/contacts/services/birthdays';
import { plural } from '@unlease/core/services/format';
import { contactName } from '@unlease/contacts/services/names';
import { wishWays } from '@unlease/contacts/services/wishes';
import { useUpcomingBirthdays } from '@app/hooks/useContacts';
import { deviceRegion } from '@app/reach';
import { useMinute } from '@shared/app/hooks/useMinute';

import { AppText, Button, EdgeSectionList, EmptyState, Ground, Tappable, TopBar } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { listPressDelay } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import { BirthdayNotices } from '../features/contacts/BirthdayNotices';
import { useWish } from '../features/contacts/WishSheet';
import type { ScreenProps } from '../navigation/types';

export function BirthdaysScreen({ navigation }: ScreenProps<'Birthdays'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const now = useMinute();
  const coming = useUpcomingBirthdays(now, 366);
  // Grouped as on the web (`birthdayGroups`): today, this week, then month by month.
  const sections = useMemo(() => birthdayGroups(coming, now).map(group => ({ title: group.title, data: group.entries })), [coming, now]);
  const { wish, sheet } = useWish();

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Birthdays')} onBack={() => navigation.goBack()} />
      <EdgeSectionList
        sections={sections}
        keyExtractor={entry => entry.contact.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.notices}>
            <BirthdayNotices />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <AppText variant="section" style={styles.head} accessibilityRole="header">
            {section.title}
          </AppText>
        )}
        renderItem={({ item }) => {
          const name = contactName(item.contact);
          // Today's, with a number or an e-mail: « Souhaiter » beside the row, out of its press.
          const wishing = item.days === 0 && wishWays(item.contact, deviceRegion()).length > 0;
          const age = ageToday(item.birthday, now);
          return (
            <View style={styles.line}>
              <Tappable unstable_pressDelay={listPressDelay} onPress={() => navigation.navigate('Contact', { id: item.contact.id })} style={styles.row} accessibilityRole="link" accessibilityLabel={name}>
                <ContactAvatar contact={item.contact} size={40} />
                <View style={styles.text}>
                  <AppText variant={item.days === 0 ? 'bodyStrong' : 'body'} numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText variant="meta" numberOfLines={1} color={item.days === 0 ? theme.color.action : undefined}>
                    {/* With « Souhaiter » beside it, the age alone: the head says « Aujourd’hui ». */}
                    {wishing ? [formatBirthday({ ...item.birthday, year: null }), age !== null && age > 0 ? plural(age, 'year') : null].filter(Boolean).join(' · ') : `${formatBirthday({ ...item.birthday, year: null })} · ${birthdayWhen(item.birthday, now)}`}
                  </AppText>
                </View>
              </Tappable>
              {wishing ? <Button kind="tonal" small icon="bubble" label={t('Send wishes')} accessibilityLabel={t('Wish {name} a happy birthday', { name })} onPress={() => wish(item.contact)} style={styles.wish} /> : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState scene="reminders" title={t('No birthdays')} text={t('Add a birthday to a contact: it shows here, with how many days away it is.')} />
        }
      />
      {sheet}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48 },
    // The switch row's words and the choices under it on the column the heads and the faces start on (20).
    notices: { paddingTop: 4, paddingHorizontal: 4 },
    head: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6, color: theme.color.inkMuted },
    // As the list's rows: the face 20 in, the name at 76, 56 high; « Souhaiter » after it, 16 from the screen's edge.
    line: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginVertical: GEOMETRY.rowGap / 2 },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, ...corners(SHAPES.tab) },
    wish: { marginLeft: 4, marginRight: 8 },
    text: { flex: 1, gap: 1 },
  });
