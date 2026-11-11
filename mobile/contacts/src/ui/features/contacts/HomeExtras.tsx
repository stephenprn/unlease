/**
 * What the list shows above its letters, as Google's: the favourites in a row of faces, and the
 * birthdays of the week in one line that leads to them all.
 */
import React, { memo, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { birthdayWhen } from '@unlease/contacts/services/birthdays';
import { contactName } from '@unlease/contacts/services/names';
import { useContact, useContactIds, useUpcomingBirthdays } from '@app/hooks/useContacts';
import { useMinute } from '@shared/app/hooks/useMinute';

import { AppText, Icon, Tappable } from '@shared/ui/components';
import { accelerate, decelerate, duration, listIn, listMove } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from './ContactAvatar';

const FACE = 56;

/** A face starred elsewhere settles into the row, the others make room; one unstarred leaves where it was. */
const FACE_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.9 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium).delay(duration.short);
const FACE_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.94 }], easing: accelerate } }).duration(duration.short);
const MAKE_ROOM = listMove;
/** The row or the line arriving while the list is shown (a first favourite, a birthday this week). */
const BLOCK_IN = listIn;

/** False on the first render: what is there when the list opens stays still; what comes later settles in. */
function useArrived(): boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return mounted.current;
}

const Favorite = memo(function FavoriteFace({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const contact = useContact(id);
  if (!contact) return null;
  const name = contactName(contact);
  return (
    <Tappable onPress={() => onOpen(id)} style={styles.favorite} accessibilityRole="link" accessibilityLabel={name}>
      <ContactAvatar contact={contact} size={FACE} />
      <AppText variant="meta" color={undefined} numberOfLines={1} style={styles.favoriteName}>
        {contact.firstName.trim() || name}
      </AppText>
    </Tappable>
  );
});

/** The favourites' row; nothing while there are none. */
export function FavoritesStrip({ onOpen }: { onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const ids = useContactIds('favorites');
  const arrived = useArrived();
  if (ids.length === 0) return null;
  return (
    <Animated.View entering={arrived ? BLOCK_IN : undefined} style={styles.block}>
      <AppText variant="section" style={styles.head} accessibilityRole="header">
        {t('Favoris')}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {ids.map(id => (
          <Animated.View key={id} layout={MAKE_ROOM} entering={arrived ? FACE_IN : undefined} exiting={FACE_OUT}>
            <Favorite id={id} onOpen={onOpen} />
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

/** The week's birthdays in a line (« Aujourd’hui · Léa Martin, 35 ans »); nothing when none comes. */
export function BirthdayLine({ onOpen }: { onOpen: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const now = useMinute();
  const coming = useUpcomingBirthdays(now, 7);
  if (coming.length === 0) return null;
  const first = coming[0]!;
  const others = coming.length - 1;
  const line = `${contactName(first.contact)} · ${birthdayWhen(first.birthday, now)}`;
  return (
    <Tappable onPress={onOpen} style={styles.birthday} accessibilityRole="link" accessibilityLabel={t('Anniversaires')}>
      <View style={styles.birthdayMark}>
        <Icon name="cake" size={22} color={theme.color.action} />
      </View>
      <View style={styles.birthdayText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {line}
        </AppText>
        {others > 0 ? (
          <AppText variant="meta" numberOfLines={1}>
            {t('et {others} cette semaine', { others: plural(others, 'autre') })}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevronRight" size={20} color={theme.color.inkMuted} />
    </Tappable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    block: { paddingTop: 8 },
    head: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
    // The first face on the list's faces' column (20 from the edge).
    strip: { paddingHorizontal: 10, gap: 4 },
    favorite: { width: FACE + 20, alignItems: 'center', gap: 6, paddingVertical: 6, ...corners(SHAPES.tab) },
    favoriteName: { color: theme.color.ink, maxWidth: FACE + 16, textAlign: 'center' },
    // A row of the list: the cake centred in the faces' column, the words on the names' (76).
    birthday: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 8, marginTop: 8, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, ...corners(SHAPES.tab) },
    birthdayMark: { width: 40, alignItems: 'center' },
    birthdayText: { flex: 1 },
  });
