/**
 * One contact, read from the top down as on the web: who they are (their face on a large pebble,
 * their name, their work, their labels), the bar holding what is done to the card (the star, edit, a
 * menu: share the card, labels, a gift idea kept in Carnet, to the bin, undone from the slip); then
 * one row of ways to reach them, the web's order and glyphs (call `phoneCall`, SMS `bubble`, WhatsApp
 * `phone`, its video `video`, email `email`, the way there `mapPin` in the maps app chosen, or the
 * phone's maps apps offered: `openPlace`); then « Coordonnées » (each number with its calling code,
 * a national one taking the « Indicatif par défaut »'s: a tap calls it, its bubble writes; WhatsApp on one line, its calls at its end where WhatsApp knows the number, read from
 * the phone's contacts once allowed; each email), each address on a card of its own with its little
 * plan, a press opening it (« Ouvrir dans Google Maps » once a maps app is chosen), « À propos » (the birthday, the note). A long press copies a line.
 * On their birthday and the day after, a notice over the cards offers « Souhaiter » (the wish written
 * into an SMS, WhatsApp or an e-mail, `WishSheet`); in the week before it, « À propos » says when this
 * phone's notification comes and turns on « Prévenir la veille » (or the notifications themselves).
 * At the foot, the events they are in and the pages and notes that mention them.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import { t, tc } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import type { AddressEntry, Contact } from '@unlease/contacts/models/contacts';
import { ageToday, birthdayWhen, formatBirthday, readBirthday } from '@unlease/contacts/services/birthdays';
import { reminderNear, reminderRuleWords } from '@unlease/contacts/services/birthdayReminders';
import { wishDaysLate, wishWays } from '@unlease/contacts/services/wishes';
import { plural } from '@unlease/core/services/format';
import { addressLine, addressLines, phoneKindName, placeKindName } from '@unlease/contacts/services/addresses';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { callNumber as primaryNumber, shownNumber, whatsappNumber } from '@unlease/contacts/services/phones';
import { useResolvedContact } from '@app/hooks/useContacts';
import { restoreContacts, setFavorite, setLabel, trashContacts } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { callNumber, regionFor, shareContact, textNumber, whatsappCall, whatsappChat, whatsappReach, writeEmail, type WhatsappReach } from '@app/reach';
import { selectBirthdays, selectRegion, setBirthdaySettings, useContactsUiStore } from '@app/store/contactsUi';
import { turnBirthdaysOn } from '@app/birthdayAlerts';
import { askPermission, openAppSettings } from '@platform/phoneContacts';
import { useMinute } from '@shared/app/hooks/useMinute';
import { openPlace } from '@shared/app/openPlace';
import { mapsChoiceName, useMapsChoice } from '@shared/app/store/mapsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { copyText } from '@shared/platform/clipboard';

import { AppText, Button, EmptyState, Ground, Icon, IconButton, LabelMark, Menu, Organic, SwitchMark, Tappable, TopBar, type MenuItem } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { AddressPlan } from '../features/contacts/AddressPlan';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import { GiftSheet } from '../features/contacts/GiftSheet';
import { LabelSheet } from '../features/contacts/LabelSheet';
import { MentionedIn } from '../features/contacts/MentionedIn';
import { ROW_INSET, rowCorners } from '../features/contacts/rows';
import { useWish } from '../features/contacts/WishSheet';
import type { ScreenProps } from '../navigation/types';
import { later } from '@app/later';
import { giftsUnavailable } from '@app/gifts';

/** The card as it opens: the face settles first, then the ways to reach them, then what is known, each a beat after the other. */
const FACE_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.94 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const rise = (delay: number) => new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium).delay(delay);
const ACTIONS_IN = rise(60);
const DETAILS_IN = rise(120);

/** One way to reach them: its glyph on a tonal pebble, its word under it; the row shares the width. */
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

interface DetailProps {
  readonly icon: GlyphName | null;
  readonly value: string;
  readonly kind?: string;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly trailing?: React.ReactNode;
  /** A value that leaves the app when pressed (a number, an address): in the link's ink. */
  readonly link?: boolean;
  /** A setting the line turns on or off (its press): drawn as a switch at its end, said as one. */
  readonly checked?: boolean;
  /** What a screen reader adds after it. */
  readonly hint?: string;
}

/** A line of a card: its glyph, its value over what it is; a tap does its first thing, the trailing buttons the others. */
function Detail({ icon, value, kind, onPress, onLongPress, trailing, link, checked, hint, index, count }: DetailProps & { index: number; count: number }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={[styles.detailRow, index > 0 ? styles.detailAfter : null]}>
      {index > 0 ? <View style={styles.rule} /> : null}
      <Tappable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        style={[styles.detail, rowCorners(index, count)]}
        accessibilityRole={checked !== undefined ? 'switch' : onPress ? 'button' : undefined}
        accessibilityState={checked !== undefined ? { checked } : undefined}
        accessibilityLabel={kind ? `${value}, ${kind}` : value}
        accessibilityHint={hint}
      >
        <View style={styles.detailIcon}>{icon ? <Icon name={icon} size={22} color={theme.color.inkMuted} /> : null}</View>
        <View style={styles.detailText}>
          <AppText variant="body" color={link ? theme.color.link : undefined}>
            {value}
          </AppText>
          {kind ? <AppText variant="meta">{kind}</AppText> : null}
        </View>
        {checked !== undefined ? <SwitchMark checked={checked} /> : null}
      </Tappable>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

/** A card of lines, its head over it. */
function Card({ title, lines }: { title: string; lines: readonly (DetailProps & { key: string })[] }) {
  const styles = useThemedStyles(makeStyles);
  if (lines.length === 0) return null;
  return (
    <View style={styles.block}>
      <AppText variant="section" style={styles.blockHead} accessibilityRole="header">
        {title}
      </AppText>
      <Organic outline="card" style={styles.card}>
        {lines.map(({ key, ...line }, index) => (
          <Detail key={key} {...line} index={index} count={lines.length} />
        ))}
      </Organic>
    </View>
  );
}

const copy = (text: string): void => {
  later(copyText(text).then(done => done && showSnack(t('Copié'), undefined, { tone: 'success' })));
};

/** An address on its card: its plan, its lines (the street first) and what it is; under them, where it opens (the maps app chosen, else the phone's offered). A press opens it, a long press copies it. */
function PlaceCard({ address }: { address: AddressEntry }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const chosen = useMapsChoice();
  const lines = addressLines(address);
  const open = (): void => later(openPlace(addressLine(address)));
  return (
    <Organic outline="card" style={styles.placeCard}>
      <Tappable onPress={open} onLongPress={() => copy(lines.join('\n'))} style={[styles.placeMain, rowCorners(0, 2)]} accessibilityLabel={`${lines.join(', ')}, ${placeKindName(address)}`} accessibilityHint={t('Un appui l’ouvre dans les cartes, un appui long la copie.')}>
        <Organic outline="frame" style={styles.planFrame}>
          <AddressPlan address={addressLine(address)} />
        </Organic>
        <View style={styles.placeText}>
          {lines.map((line, index) => (
            <AppText key={index} variant={index === 0 ? 'bodyStrong' : 'body'} color={index === 0 ? undefined : theme.color.inkMuted}>
              {line}
            </AppText>
          ))}
          <AppText variant="meta" style={styles.placeKind}>
            {placeKindName(address)}
          </AppText>
        </View>
      </Tappable>
      <View style={styles.placeTools}>
        <Button label={chosen ? t('Ouvrir dans {maps}', { maps: mapsChoiceName(chosen) }) : t('Ouvrir l’adresse')} icon="mapPin" kind="tonal" small onPress={open} />
      </View>
    </Organic>
  );
}

function Addresses({ contact }: { contact: Contact }) {
  const styles = useThemedStyles(makeStyles);
  const shown = contact.addresses.filter(address => addressLine(address));
  if (shown.length === 0) return null;
  return (
    <View style={styles.block}>
      <AppText variant="section" style={styles.blockHead} accessibilityRole="header">
        {shown.length > 1 ? t('Adresses') : t('Adresse')}
      </AppText>
      {shown.map(address => (
        <PlaceCard key={address.id} address={address} />
      ))}
    </View>
  );
}

export function ContactScreen({ navigation, route }: ScreenProps<'Contact'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // A contact merged into another opens as the one kept (a link from a widget, a mention, another app).
  const contact = useResolvedContact(route.params.id) ?? undefined;
  const id = contact?.id ?? route.params.id;
  const labels = useLibraryStore(s => s.labels);
  const now = useMinute();
  const [menu, setMenu] = useState(false);
  const [labelling, setLabelling] = useState(false);
  const [gifting, setGifting] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsappReach>({ installed: false, calls: { voice: '', video: '' } });
  const [asked, setAsked] = useState(0);
  const reminders = useContactsUiStore(selectBirthdays);
  const { wish, sheet: wishSheet } = useWish();
  const waNumber = contact ? (whatsappNumber(contact)?.number ?? null) : null;
  // A national number is shown with the « Indicatif par défaut »'s code.
  const region = regionFor(useContactsUiStore(selectRegion));

  useEffect(() => {
    let live = true;
    whatsappReach(waNumber).then(reach => live && setWhatsapp(reach));
    return () => {
      live = false;
    };
  }, [waNumber, asked]);

  // A birthday notification's « Message » opens the page asking how to wish it (or sends it the one way there is).
  const wishAsked = route.params.wish === true;
  useEffect(() => {
    if (!wishAsked || !contact) return;
    navigation.setParams({ wish: undefined });
    wish(contact);
  }, [wishAsked, contact, navigation, wish]);

  if (!contact || contact.deletedAt !== null) {
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        <EmptyState scene="trash" title={t('Ce contact n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')} />
      </View>
    );
  }

  const name = contactName(contact);
  const work = workLine(contact);
  const toCall = primaryNumber(contact);
  const email = contact.emails.find(entry => entry.address.trim());
  const place = contact.addresses.find(entry => addressLine(entry));
  const birthday = readBirthday(contact.birthday);
  const worn = contact.labelIds.map(labelId => labels[labelId]).filter(label => label && label.deletedAt === null);
  const trashed = contact.trashedAt !== null;
  // Their birthday today or yesterday, and a way to write to them: « Souhaiter ».
  const late = birthday && !trashed ? wishDaysLate(birthday, now) : null;
  const ways = late !== null ? wishWays(contact, region, { whatsapp: whatsapp.installed }) : [];
  const age = birthday ? ageToday(birthday, now) : null;

  const toBin = (): void => {
    const undo = trashContacts([id]);
    navigation.goBack();
    showSnack(t('Contact placé dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };
  // The star says what it did, and takes it back from the slip, as on the web.
  const toggleFavorite = (): void => {
    const undo = setFavorite(id, !contact.favorite);
    showSnack(contact.favorite ? t('Retiré des favoris') : t('Ajouté aux favoris'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  const menuItems: MenuItem[] = [
    { label: t('Partager'), icon: 'share', onPress: () => later(shareContact(contact)) },
    { label: t('Libellés'), icon: 'tag', onPress: () => setLabelling(true) },
    // Without a server running Carnet, the slip says why rather than a sheet that cannot keep it (as on the web).
    {
      label: t('Idée cadeau…'),
      icon: 'bag',
      onPress: () => {
        const why = giftsUnavailable();
        if (why) showSnack(why, undefined, { tone: 'warning' });
        else setGifting(true);
      },
    },
    { label: t('Supprimer'), icon: 'trash', danger: true, onPress: toBin },
  ];

  const askWhatsapp = async (): Promise<void> => {
    const answer = await askPermission('contacts');
    if (answer === 'granted') setAsked(value => value + 1);
    else if (answer === 'blocked')
      showSnack(t('L’accès aux contacts du téléphone est refusé : il se donne dans les réglages d’Android.'), { label: t('Réglages'), run: openAppSettings }, { tone: 'warning' });
  };

  let turn = 0;
  const next = (): number => (turn += 1);

  const reach: (DetailProps & { key: string })[] = [
    ...contact.phones.map(phone => {
      const shown = shownNumber(phone.number, region);
      return {
        key: phone.id,
        icon: 'phoneCall' as const,
        value: shown,
        kind: phoneKindName(phone),
        link: true,
        onPress: () => later(callNumber(phone.number)),
        onLongPress: () => copy(shown),
        trailing: <IconButton icon="bubble" label={t('Écrire à {number}', { number: shown })} onPress={() => later(textNumber(phone.number))} />,
      };
    }),
    ...(waNumber && whatsapp.installed
      ? [
          {
            key: 'whatsapp',
            icon: 'phone' as const,
            value: t('WhatsApp'),
            kind: shownNumber(waNumber, region),
            onPress: () => later(whatsappChat(waNumber)),
            trailing:
              whatsapp.calls.voice || whatsapp.calls.video ? (
                <>
                  {whatsapp.calls.voice ? <IconButton icon="phoneCall" label={t('Appel vocal WhatsApp')} onPress={() => later(whatsappCall(whatsapp.calls.voice, false))} /> : null}
                  {whatsapp.calls.video ? <IconButton icon="video" label={t('Appel vidéo WhatsApp')} onPress={() => later(whatsappCall(whatsapp.calls.video, true))} /> : null}
                </>
              ) : undefined,
          },
          ...(!whatsapp.calls.voice && !whatsapp.calls.video && asked === 0
            ? [{ key: 'whatsapp-calls', icon: null, value: t('Afficher les appels WhatsApp'), kind: t('Lit les contacts du téléphone, où WhatsApp note les numéros qu’il connaît.'), link: true, onPress: () => later(askWhatsapp()) }]
            : []),
        ]
      : []),
    ...contact.emails
      .filter(entry => entry.address.trim())
      .map(entry => ({ key: entry.id, icon: 'email' as const, value: entry.address, kind: placeKindName(entry), link: true, onPress: () => later(writeEmail(entry.address)), onLongPress: () => copy(entry.address) })),
  ];

  // The week before their birthday: when this phone tells of it, and « Prévenir la veille » (or the notifications turned on), for every birthday.
  const reminder: (DetailProps & { key: string }) | null =
    birthday && !trashed && reminderNear(birthday, now)
      ? reminders.enabled
        ? { key: 'reminder', icon: 'bell', value: t('Prévenir la veille'), kind: reminderRuleWords(reminders), checked: reminders.dayBefore, hint: t('Pour tous les anniversaires, sur ce téléphone'), onPress: () => setBirthdaySettings({ dayBefore: !reminders.dayBefore }) }
        : { key: 'reminder', icon: 'bellOff', value: t('Prévenir des anniversaires'), kind: t('Une notification le jour venu, sur ce téléphone.'), checked: false, onPress: () => later(turnBirthdaysOn(true)) }
      : null;

  const about: (DetailProps & { key: string })[] = [
    ...(birthday ? [{ key: 'birthday', icon: 'cake' as const, value: formatBirthday(birthday), kind: birthdayWhen(birthday, now) }] : []),
    ...(reminder ? [reminder] : []),
    ...(contact.note.trim() ? [{ key: 'note', icon: 'note' as const, value: contact.note.trim(), onLongPress: () => copy(contact.note.trim()) }] : []),
  ];

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        onBack={() => navigation.goBack()}
        actions={
          trashed ? undefined : (
            <>
              <IconButton icon="star" label={contact.favorite ? t('Retirer des favoris') : t('Ajouter aux favoris')} selected={contact.favorite} onPress={toggleFavorite} />
              <IconButton icon="edit" label={t('Modifier')} onPress={() => navigation.navigate('Edit', { id })} />
              <IconButton icon="more" label={t('Plus d’actions')} onPress={() => setMenu(true)} />
            </>
          )
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {trashed ? (
          // As on the web: the page says it is in the bin, and brings it back.
          <Organic outline="panel" style={styles.binNotice}>
            <View style={styles.detailIcon}>
              <Icon name="trash" size={22} color={theme.color.inkMuted} />
            </View>
            <AppText variant="body" style={styles.binText}>
              {t('Ce contact est dans la corbeille.')}
            </AppText>
            <Button kind="text" icon="restore" label={t('Restaurer')} onPress={() => showSnack(t('Contact restauré'), { label: tc('undo', 'Annuler'), run: restoreContacts([id]) }, { tone: 'success' })} />
          </Organic>
        ) : null}
        <View style={styles.head}>
          <Animated.View entering={FACE_IN}>
            <ContactAvatar contact={contact} size={120} />
          </Animated.View>
          <AppText variant="display" style={styles.name} selectable>
            {name}
          </AppText>
          {work ? (
            <AppText variant="body" color={theme.color.inkMuted} style={styles.centered}>
              {work}
            </AppText>
          ) : null}
          {worn.length > 0 ? (
            <View style={styles.labels}>
              {worn.map(label => (
                <LabelMark key={label!.id} name={label!.name} color={label!.color} />
              ))}
            </View>
          ) : null}
        </View>

        {toCall || email || waNumber || place ? (
          <Animated.View entering={ACTIONS_IN} style={styles.actions}>
            {toCall ? <Action icon="phoneCall" label={t('Appeler')} turn={next()} onPress={() => later(callNumber(toCall.number))} /> : null}
            {toCall ? <Action icon="bubble" label={t('SMS')} turn={next()} onPress={() => later(textNumber(toCall.number))} /> : null}
            {waNumber && whatsapp.installed ? <Action icon="phone" label={t('WhatsApp')} turn={next()} onPress={() => later(whatsappChat(waNumber))} /> : null}
            {whatsapp.calls.video ? <Action icon="video" label={t('Vidéo')} turn={next()} onPress={() => later(whatsappCall(whatsapp.calls.video, true))} /> : null}
            {email ? <Action icon="email" label={t('E-mail')} turn={next()} onPress={() => later(writeEmail(email.address))} /> : null}
            {place ? <Action icon="mapPin" label={t('Itinéraire')} turn={next()} onPress={() => later(openPlace(addressLine(place), { directions: true, title: t('Itinéraire jusqu’à {name}', { name }) }))} /> : null}
          </Animated.View>
        ) : null}

        <Animated.View entering={DETAILS_IN} style={styles.details}>
          {late !== null && ways.length > 0 ? (
            // Their day: the cake on the faces' column, the day and the age reached, « Souhaiter » at the end.
            <Organic outline="panel" style={styles.wishNotice}>
              <View style={styles.detailIcon}>
                <Icon name="cake" size={22} color={theme.color.action} />
              </View>
              <View style={styles.binText}>
                <AppText variant="bodyStrong">{t('Son anniversaire')}</AppText>
                <AppText variant="meta">{[late === 0 ? t('Aujourd’hui') : t('Hier'), age !== null && age > 0 ? plural(age, 'an') : null].filter(Boolean).join(' · ')}</AppText>
              </View>
              <Button kind="tonal" icon="bubble" label={t('Souhaiter')} accessibilityLabel={t('Souhaiter son anniversaire à {name}', { name })} onPress={() => wish(contact, ways)} />
            </Organic>
          ) : null}
          <Card title={t('Coordonnées')} lines={reach} />
          <Addresses contact={contact} />
          <Card title={t('À propos')} lines={about} />
          {reach.length === 0 && !place && about.length === 0 ? (
            <AppText variant="meta" style={styles.none}>
              {t('Aucune coordonnée. « Modifier » en ajoute.')}
            </AppText>
          ) : null}

          <MentionedIn id={id} />
        </Animated.View>
      </ScrollView>
      <Menu visible={menu} items={menuItems} onDismiss={() => setMenu(false)} />
      <GiftSheet visible={gifting} name={name} contactId={contact.id} onDismiss={() => setGifting(false)} />
      {wishSheet}
      <LabelSheet
        visible={labelling}
        chosen={contact.labelIds}
        onDismiss={() => setLabelling(false)}
        onChange={ids => {
          const before = new Set(contact.labelIds);
          for (const labelId of ids) if (!before.has(labelId)) setLabel([id], labelId, true);
          for (const labelId of contact.labelIds) if (!ids.includes(labelId)) setLabel([id], labelId, false);
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48, gap: 20 },
    // Its glyph and words on the cards' columns below it (the glyph 16 in, the words at 56).
    binNotice: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 60, marginHorizontal: 12, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, backgroundColor: theme.color.paper },
    binText: { flex: 1 },
    // As the bin's notice: the glyph 16 in, the words at 56, its button 8 from the end.
    wishNotice: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, marginHorizontal: 12, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, backgroundColor: theme.color.paper },
    details: { gap: 20 },
    head: { alignItems: 'center', gap: 4, paddingHorizontal: 24, paddingTop: 4 },
    name: { textAlign: 'center', marginTop: 12 },
    centered: { textAlign: 'center' },
    labels: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 6 },
    actions: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 8 },
    action: { flex: 1, maxWidth: 80, alignItems: 'center', gap: 6 },
    actionStone: { width: 56, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.actionContainer },
    block: { gap: 8 },
    // In line with what the cards hold (16 in from their edge), as Réglages' section titles.
    blockHead: { paddingHorizontal: 28 },
    card: { marginHorizontal: 12, padding: ROW_INSET, backgroundColor: theme.color.paper },
    detailRow: { flexDirection: 'row', alignItems: 'center' },
    // A row after another, the rows' gap under it, its rule in the middle of that gap: a press never runs into the line.
    detailAfter: { marginTop: GEOMETRY.rowGap },
    // From the text column (56 from the card's edge, the row's 6 inset counted) to the row's end.
    rule: { position: 'absolute', top: -GEOMETRY.rowGap / 2, left: 50, right: 10, height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline },
    // A list row on a card: its glyph 16 from the card's edge in a 24 slot, its words at 56.
    detail: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, paddingHorizontal: 10, paddingVertical: 8 },
    detailIcon: { width: 24, alignItems: 'center' },
    detailText: { flex: 1, gap: 1 },
    trailing: { flexDirection: 'row', alignItems: 'center' },
    // The plan and the button on the cards' glyph column (16 in from the edge), the press a row's (6 in).
    placeCard: { marginHorizontal: 12, padding: ROW_INSET, gap: GEOMETRY.rowGap, backgroundColor: theme.color.paper },
    placeMain: { flexDirection: 'row', gap: 16, padding: 10 },
    planFrame: { width: 96, height: 88, overflow: 'hidden', backgroundColor: theme.color.paperHigh },
    placeText: { flex: 1, paddingTop: 2 },
    placeKind: { marginTop: 2 },
    placeTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 10 },
    none: { paddingHorizontal: 24, textAlign: 'center' },
  });
