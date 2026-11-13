/**
 * A contact's birthday, as the calendar shows it: who, how old they turn, and what to do about it:
 * on the day and the day after, « Souhaiter » (the wish written into an SMS, WhatsApp or an e-mail,
 * `WishSheet`); the ways to reach them in Contacts' order and glyphs (call `phoneCall`, SMS `bubble`,
 * WhatsApp `phone` where their number has its country, e-mail `email`, the way there `mapPin`;
 * WhatsApp's video call needs the phone's contacts, which only Contacts reads), then open them in
 * Contacts; the gift ideas kept for them in Carnet's « Cadeaux », and one more added (« Ajouter »).
 * Last, who tells of it: birthday notifications are Contacts' (a setting of its phone app, which no
 * other app reads), so the page says so and opens Contacts' birthdays, where they are set, when it is
 * installed here.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { APPS } from '@unlease/core/apps';
import { t, tc } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { readBirthday } from '@unlease/contacts/services/birthdays';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { addressLine, mailtoHref } from '@unlease/contacts/services/addresses';
import { callNumber, regionOf, smsHref, telHref, whatsappNumber, whatsappUrl } from '@unlease/contacts/services/phones';
import { wishDueAfter, wishMessage, wishWays } from '@unlease/contacts/services/wishes';
import { LAYER_COLORS } from '@unlease/calendar/services/colors';
import { birthdayTitle, dayDistance, longDay } from '@unlease/calendar/services/eventText';
import { daysBetween, today as todayOf } from '@unlease/calendar/services/time';
import { giftIdeas, sendGift } from '@app/gifts';
import { useLibraryStore } from '@app/store/libraryStore';
import { later } from '@app/later';
import { useMinute } from '@shared/app/hooks/useMinute';
import { useInstalledApps } from '@shared/app/hooks/useAppReachable';
import { contactPlace, notesPlace, openInApp } from '@shared/app/openApp';
import { openPlace } from '@shared/app/openPlace';
import { showSnack } from '@shared/app/store/uiStore';
import { deviceLanguage } from '@shared/platform/locale';

import { AppText, Button, EdgeScrollView, EmptyLine, EmptyState, FormFoot, Ground, Icon, Organic, PanelTappable, RowPanel, Sheet, SHEET_INSET, Tappable, TextField, TopBar, useForm, useUnsaved } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';
import { useWish, WishSheet } from '../features/birthday/WishSheet';

const CONTACTS_ONLY = ['contacts'] as const;
/** Contacts' birthdays, its notifications' settings at their head (`unlease-contacts://birthdays`). */
const CONTACTS_BIRTHDAYS = { phone: 'birthdays', web: '/contacts/birthdays' } as const;

function Action({ icon, label, turn, onPress }: { icon: GlyphName; label: string; turn: number; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.action}>
      <Tappable pebble={turn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.actionStone}>
        <Icon name={icon} size={24} color={theme.color.onActionContainer} />
      </Tappable>
      <AppText variant="labelSmall" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const open = (url: string | null): void => {
  if (url) later(Linking.openURL(url).catch(() => showSnack(t('No app on this phone opens it.'), undefined, { tone: 'warning' })));
};

export function BirthdayScreen({ navigation, route }: ScreenProps<'Birthday'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const now = useMinute();
  const today = todayOf(now);
  const state = useLibraryStore();
  const contact = resolveContact(state.people.contacts, route.params.id);
  const [gifting, setGifting] = useState(false);
  const [url, setUrl] = useState('');
  const contactsHere = useInstalledApps(CONTACTS_ONLY).length > 0;
  const day = route.params.day ?? today;
  // The wish on the day shown when it is today or yesterday, the ways the person has.
  const ways = contact && contact.deletedAt === null && wishDueAfter(daysBetween(day, today)) ? wishWays(contact, regionOf(deviceLanguage())) : [];
  const wishing = useWish(ways);
  // A link typed is never lost by a slip of the sheet (a drag, the scrim, Back).
  const unsaved = useUnsaved(gifting && url.trim() !== '');
  const closeGift = (): void => {
    setGifting(false);
    setUrl('');
  };
  const addIdea = async (): Promise<boolean> => {
    if (!contact) return false;
    const problem = await sendGift(url, contactName(contact), contact.id);
    if (problem) {
      form.fail(null, problem);
      return false;
    }
    unsaved.saved();
    closeGift();
    return true;
  };
  const form = useForm({ url: !url.trim() ? t('Paste the product’s link.') : /^https?:\/\/\S+\.\S+$/i.test(url.trim()) ? null : t('A link starting with https://, such as https://example.com/product.') }, { sendOnDone: addIdea });

  if (!contact || contact.deletedAt !== null) {
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        {/* The web's words, the suite's empty place. */}
        <EmptyState scene="reminders" title={t('No birthday')} text={t('This contact has no birthday, or no longer exists.')} />
      </View>
    );
  }
  const name = contactName(contact);
  const birthday = readBirthday(contact.birthday);
  const year = Number(day.slice(0, 4));
  const age = birthday?.year != null && year > birthday.year ? year - birthday.year : null;
  const number = callNumber(contact);
  const wa = whatsappNumber(contact);
  const waUrl = wa ? whatsappUrl(wa.number, regionOf(deviceLanguage())) : null;
  const email = contact.emails.find(entry => mailtoHref(entry.address));
  const place = contact.addresses.find(entry => addressLine(entry));
  const ideas = giftIdeas(state, contact.id, name);
  let turn = 0;
  const next = (): number => (turn += 1);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar onBack={() => navigation.goBack()} />
      <EdgeScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Organic pebble={1} style={styles.cake}>
            <Icon name="cake" size={40} color={theme.line[LAYER_COLORS.birthday].on} />
          </Organic>
          <AppText variant="display" style={styles.centered}>
            {birthdayTitle(name, age)}
          </AppText>
          <AppText variant="body" color={theme.color.inkMuted}>
            {longDay(day)} · {dayDistance(day, today)}
          </AppText>
          {ways.length > 0 ? <Button kind="tonal" icon="bubble" label={t('Send wishes')} accessibilityLabel={t('Wish {name} a happy birthday', { name })} onPress={wishing.wish} style={styles.wish} /> : null}
        </View>
        <View style={styles.actions}>
          {number ? <Action icon="phoneCall" label={t('Call')} turn={next()} onPress={() => open(telHref(number.number))} /> : null}
          {number ? <Action icon="bubble" label={tc('message', 'Text')} turn={next()} onPress={() => open(smsHref(number.number))} /> : null}
          {waUrl ? <Action icon="phone" label={t('WhatsApp')} turn={next()} onPress={() => open(waUrl)} /> : null}
          {email ? <Action icon="email" label={t('Email')} turn={next()} onPress={() => open(mailtoHref(email.address))} /> : null}
          {place ? <Action icon="mapPin" label={t('Directions')} turn={next()} onPress={() => later(openPlace(addressLine(place), { directions: true, title: t('Directions to {name}', { name }) }))} /> : null}
          <Action icon="person" label={APPS.contacts.name} turn={next()} onPress={() => later(openInApp('contacts', contactPlace(contact.id)))} />
        </View>
        <RowPanel outline="card" style={styles.panel}>
          <AppText variant="section" style={styles.panelHead} accessibilityRole="header">
            {t('Gift ideas')}
          </AppText>
          {/* On the rows' columns: the glyph on theirs, the words on theirs. */}
          {ideas.length === 0 ? <EmptyLine glyph="bag" slot={24} gap={16} text={t('No idea kept for {name} in “Gifts”.', { name })} style={styles.none} /> : null}
          {ideas.map(idea => (
            <Tappable key={idea.linkId} onPress={() => later(openInApp('notes', notesPlace('link', idea.linkId)))} style={styles.idea} accessibilityRole="link" accessibilityLabel={idea.title}>
              <View style={styles.slot}>
                <Icon name={idea.done ? 'boxChecked' : 'bag'} size={22} color={theme.color.inkMuted} />
              </View>
              <AppText variant="body" numberOfLines={2} style={styles.fill}>
                {idea.title}
              </AppText>
              <Icon name="external" size={18} color={theme.color.inkMuted} />
            </Tappable>
          ))}
          {/* The list's last line, as the event form's « Ajouter un rappel »: on the rows' columns, in the link's ink. */}
          <PanelTappable onPress={() => setGifting(true)} style={styles.idea} accessibilityRole="button" accessibilityLabel={t('Add an idea')}>
            <View style={styles.slot}>
              <Icon name="plus" size={22} color={theme.color.link} />
            </View>
            <AppText variant="body" color={theme.color.link} style={styles.fill}>
              {t('Add an idea')}
            </AppText>
          </PanelTappable>
        </RowPanel>
        {/* Who tells of it: Contacts' notifications, set there (its birthdays open on them), never here. */}
        <RowPanel outline="card" style={[styles.panel, styles.panelBare]}>
          {contactsHere ? (
            <PanelTappable onPress={() => later(openInApp('contacts', CONTACTS_BIRTHDAYS))} style={styles.idea} accessibilityRole="link" accessibilityLabel={t('Birthday notifications')} accessibilityHint={t('Opens {app}’s birthdays', { app: APPS.contacts.name })}>
              <View style={styles.slot}>
                <Icon name="bell" size={22} color={theme.color.inkMuted} />
              </View>
              <View style={styles.fill}>
                <AppText variant="body">{t('Birthday notifications')}</AppText>
                <AppText variant="meta">{t('Sent by {app}: the hour and the day before are chosen there.', { app: APPS.contacts.name })}</AppText>
              </View>
              <Icon name="external" size={18} color={theme.color.inkMuted} />
            </PanelTappable>
          ) : (
            <View style={styles.idea}>
              <View style={styles.slot}>
                <Icon name="bell" size={22} color={theme.color.inkMuted} />
              </View>
              <View style={styles.fill}>
                <AppText variant="body">{t('Birthday notifications')}</AppText>
                <AppText variant="meta">{t('Sent by {app}, once it is installed on this phone.', { app: APPS.contacts.name })}</AppText>
              </View>
            </View>
          )}
        </RowPanel>
      </EdgeScrollView>
      <Sheet visible={gifting} onDismiss={unsaved.guard(closeGift)} title={t('Gift idea for {name}', { name })}>
        <View style={styles.sheet}>
          <TextField
            kind="url"
            label={t('Product link')}
            field={form.field('url')}
            value={url}
            onChangeText={setUrl}
            placeholder="https://"
            autoFocus
            help={t('Kept in {app}’s “Gifts” collection.', { app: APPS.notes.name })}
          />
        </View>
        <FormFoot message={form.message}>
          <Button label={t('Cancel')} kind="text" onPress={closeGift} />
          <Button label={t('Add')} icon="plus" busy={form.busy} disabled={!url.trim()} onPress={() => later(form.submit(addIdea))} />
        </FormFoot>
      </Sheet>
      {unsaved.dialog}
      <WishSheet visible={wishing.asking} name={name} message={wishMessage(contact)} ways={ways} onDismiss={wishing.stop} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48, gap: 16 },
    head: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
    cake: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.line[LAYER_COLORS.birthday].fill },
    centered: { textAlign: 'center' },
    // The day's one action, under the date, a step apart from it.
    wish: { marginTop: 10 },
    // One row sharing the width, as Contacts' page draws the same ways to reach someone.
    actions: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 8 },
    action: { flex: 1, maxWidth: 80, alignItems: 'center', gap: 6 },
    actionStone: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.actionContainer },
    // Its last row 6 above its foot, as from its sides (its 4 and the row's 2): its press concentric with its corners (`RowPanel`).
    panel: { marginHorizontal: 12, paddingTop: 8, paddingBottom: 4, backgroundColor: theme.color.paper },
    // With no head, its row 6 under its top too.
    panelBare: { paddingTop: 4 },
    panelHead: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
    none: { paddingHorizontal: 16, paddingVertical: 8 },
    // A list row's geometry (6 in, 10, a 24 glyph slot, 16), as the event page's rows.
    idea: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    slot: { width: 24, alignItems: 'center' },
    fill: { flex: 1 },
    // The gift's field on the sheet's column, under its title.
    sheet: { gap: 12, paddingHorizontal: SHEET_INSET, paddingBottom: 12 },
  });
