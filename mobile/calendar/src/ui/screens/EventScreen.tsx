/**
 * One event, at one of its occurrences: its colour and title, when (how near, how it repeats, its zone
 * when not the phone's), where (a tap opens it in the maps app chosen, else offers the phone's maps
 * apps, `openPlace`; a long press copies it; the weather of that day beside it), who with (each face and name a tap into Contacts), its reminders, labels and calendar, its description (mentions open their app),
 * its files and address; « Mentionné dans » the pages and notes; « Créer une page de notes » in Pages.
 * The bar: edit, and a menu (duplicate, delete, with the scope a repeating event asks). A subscribed
 * calendar's event is read-only: « Copier dans mon agenda » stands on the line that says so.
 */
import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { getLocale, t, tc } from '@unlease/core/i18n';
import { safeLink } from '@unlease/core/services/url';
import type { LineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { isOwn } from '@unlease/calendar/models/events';
import { eventColor } from '@unlease/calendar/services/colors';
import { asksScope, type EditScope } from '@unlease/calendar/services/editing';
import { deletedWords, relativeWhen, reminderWords, whenLine, zoneNote } from '@unlease/calendar/services/eventText';
import { feedName } from '@unlease/calendar/services/holidays';
import { linkParts } from '@unlease/calendar/services/links';
import { findOccurrence } from '@unlease/calendar/services/occurrences';
import { today as todayOf } from '@unlease/calendar/services/time';
import { describeRule, parseRule } from '@unlease/calendar/services/recurrence';
import { WEATHER_WORDS, temperatures, weatherKind } from '@unlease/calendar/services/weather';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { deleteEvent, duplicate, restoreFromBin } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { useWeather } from '@app/hooks/useWeather';
import { createMeetingPage, SyncError } from '@app/sync/transport';
import { later } from '@app/later';
import { useMinute } from '@shared/app/hooks/useMinute';
import { contactPlace, openInApp, pagePlace } from '@shared/app/openApp';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { openPlace } from '@shared/app/openPlace';
import { mapsChoiceName, useMapsChoice } from '@shared/app/store/mapsStore';
import { copyText } from '@shared/platform/clipboard';

import { AppText, Button, EmptyState, Grain, Ground, Icon, IconButton, LabelTag, Menu, Organic, Tappable, TopBar, type MenuItem } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { paintOf } from '../features/calendar/paint';
import { MentionedIn } from '../features/event/MentionedIn';
import { PersonChip } from '../features/event/People';
import { openRef } from '../features/event/places';
import { RichView } from '../features/event/RichView';
import { ScopeSheet } from '../features/event/ScopeSheet';
import type { ScreenProps } from '../navigation/types';

/** An event's link opens only the web, mail or a telephone number: a subscribed calendar's could name another app's scheme. */
function openEventLink(url: string): void {
  const address = safeLink(url);
  if (address && !address.startsWith('/')) later(Linking.openURL(address));
}

function Line({ icon, children, onPress, onLongPress, label, hint }: { icon: GlyphName; children: React.ReactNode; onPress?: () => void; onLongPress?: () => void; label?: string; hint?: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const body = (
    <>
      <View style={styles.lineIcon}>
        <Icon name={icon} size={22} color={theme.color.inkMuted} />
      </View>
      <View style={styles.fill}>{children}</View>
    </>
  );
  // What only reads (its reminders, its labels) is content, drawn in full ink: never a control put out of reach.
  if (!onPress) return <View style={styles.line}>{body}</View>;
  return (
    <Tappable onPress={onPress} onLongPress={onLongPress} style={styles.line} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}>
      {body}
    </Tappable>
  );
}

/** A label the event wears, as the form ticks it: a chip of its wash, its tag in its pigment, its name. */
function WornLabel({ name, color }: { name: string; color: LineColor }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Organic style={[styles.worn, { backgroundColor: theme.line[color].tint }]}>
      <LabelTag color={color} size={18} />
      <AppText variant="label" numberOfLines={1} style={styles.shrink}>
        {name}
      </AppText>
    </Organic>
  );
}

export function EventScreen({ navigation, route }: ScreenProps<'Event'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const now = useMinute();
  const events = useLibraryStore(s => s.events);
  const labels = useLibraryStore(s => s.calendarLabels);
  const feeds = useLibraryStore(s => s.feeds);
  const people = useLibraryStore(s => s.people.contacts);
  const prefs = useCalendarUiStore(selectPrefs);
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  // Pages makes the page: only while the server runs it (the web's too).
  const pages = !!server && (!apps || apps.includes('pages'));
  const [menu, setMenu] = useState(false);
  const maps = useMapsChoice();
  const [scoping, setScoping] = useState(false);
  const [making, setMaking] = useState(false);

  // A link may name an exception itself: it opens as its series' occurrence.
  const named = events[route.params.id];
  const seriesId = named?.recurringId ?? route.params.id;
  const at = named?.recurringId ? named.originalStart : (route.params.at ?? null);
  const occurrence = findOccurrence(events, seriesId, at);
  const weather = useWeather(occurrence?.event.place ?? '', occurrence?.firstDay ?? '')?.day ?? null;

  if (!occurrence || occurrence.event.deletedAt !== null) {
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        <EmptyState scene="trash" title={t('Cet événement n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')} />
      </View>
    );
  }

  const event = occurrence.event;
  const series = events[occurrence.seriesId] ?? event;
  const own = isOwn(event);
  const paint = paintOf(theme, eventColor(event, labels, feeds));
  const rule = series.rrule ? parseRule(series.rrule) : null;
  const feed = event.feedId ? feeds[event.feedId] : undefined;
  const trashed = event.trashedAt !== null || series.trashedAt !== null;
  const zone = zoneNote(event);
  const title = event.title.trim() || t('Sans titre');
  const details = !!(event.place.trim() || event.contactIds.length || event.reminders.length || event.labelIds.length || feed || event.description.trim() || event.files.length || event.url.trim());
  const wornLabels = event.labelIds.map(id => labels[id]).filter((label): label is NonNullable<typeof label> => !!label && label.deletedAt === null);

  const remove = (scope: EditScope): void => {
    const words = deletedWords(occurrence, series.start, scope);
    const undo = deleteEvent(occurrence, scope);
    navigation.goBack();
    showSnack(words, { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  const copy = (): void => {
    const id = duplicate(occurrence);
    navigation.replace('Edit', { id });
  };

  const meetingPage = async (): Promise<void> => {
    if (!server) return;
    setMaking(true);
    try {
      const pageId = await createMeetingPage(server, { eventId: occurrence.seriesId, title: event.title, start: occurrence.start, contactIds: event.contactIds, lang: getLocale() });
      later(openInApp('pages', pagePlace(pageId)));
    } catch (error) {
      showSnack(error instanceof SyncError && error.status === 404 ? t('Pages n’est pas activé sur ce serveur.') : error instanceof Error && error.message ? t(error.message) : t('Serveur injoignable'), undefined, { tone: 'error' });
    } finally {
      setMaking(false);
    }
  };

  const menuItems: MenuItem[] = [
    // A subscription's is read-only: it is copied into one's own (the web's words).
    { label: own ? t('Dupliquer') : t('Copier dans mon agenda'), icon: 'copy', onPress: copy },
    ...(own && !trashed ? [{ label: t('Supprimer'), icon: 'trash' as const, danger: true, onPress: () => (asksScope(occurrence) ? setScoping(true) : remove('all')) }] : []),
  ];

  const openFile = (uploaded: boolean): void => {
    if (!uploaded || !server) {
      showSnack(t('Ce fichier s’ouvre une fois envoyé au serveur.'), undefined, { tone: 'info' });
      return;
    }
    // The server sends a file with the token in a header only: the web app opens it.
    later(Linking.openURL(`${server.url}/agenda/event/${encodeURIComponent(occurrence.seriesId)}`));
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        onBack={() => navigation.goBack()}
        actions={
          <>
            {own && !trashed ? <IconButton icon="edit" label={t('Modifier')} onPress={() => navigation.navigate('Edit', { id: occurrence.seriesId, at: occurrence.occurrence })} /> : null}
            <IconButton icon="more" label={t('Plus d’actions')} onPress={() => setMenu(true)} />
          </>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* In the bin, as on the web: it says so first, and comes back from here. */}
        {trashed ? (
          <Organic outline="panel" style={styles.binned}>
            <Grain />
            <View style={styles.lineIcon}>
              <Icon name="trash" size={22} color={theme.color.inkMuted} />
            </View>
            <AppText variant="body" style={styles.fill}>
              {t('Cet événement est dans la corbeille.')}
            </AppText>
            {series.trashedAt !== null ? (
              <Button
                kind="text"
                icon="restore"
                label={t('Restaurer')}
                onPress={() => showSnack(t('Événement restauré'), { label: tc('undo', 'Annuler'), run: restoreFromBin(series.id) }, { tone: 'success' })}
              />
            ) : null}
          </Organic>
        ) : null}

        <View style={styles.head}>
          <View style={styles.stoneSlot}>
            <Organic pebble={2} style={[styles.stone, { backgroundColor: paint.fill }]} />
          </View>
          <View style={styles.fill}>
            <AppText variant="display" selectable>
              {title}
            </AppText>
            <AppText variant="title" style={styles.when}>
              {whenLine(occurrence, now, prefs.twelveHours)}
            </AppText>
            <AppText variant="metaStrong" color={theme.color.ink}>
              {relativeWhen(occurrence, now, todayOf(now))}
            </AppText>
            {rule ? <AppText variant="meta">{describeRule(rule, series.start, series.timeZone)}</AppText> : null}
            {zone ? <AppText variant="meta">{zone}</AppText> : null}
          </View>
        </View>

        {/* The details on their panel, when there is any (the web's too). */}
        {details ? (
          <Organic outline="card" style={styles.panel}>
            {event.place.trim() ? (
              <Line
                icon="mapPin"
                label={maps ? t('{place}, ouvrir dans {maps}', { place: event.place.trim(), maps: mapsChoiceName(maps) }) : t('{place}, ouvrir dans les cartes', { place: event.place.trim() })}
                hint={t('Un appui long copie l’adresse.')}
                onPress={() => later(openPlace(event.place))}
                onLongPress={() => later(copyText(event.place.trim()).then(done => done && showSnack(t('Adresse copiée'), undefined, { tone: 'success' })))}
              >
                <View style={styles.placeLine}>
                  <AppText variant="body" color={theme.color.link} style={styles.shrink}>
                    {event.place.trim()}
                  </AppText>
                  {/* Chosen, it opens elsewhere at once; else the choice comes up. */}
                  <Icon name={maps ? 'external' : 'chevronDown'} size={16} color={theme.color.link} />
                </View>
                {weather ? (
                  <AppText variant="meta">
                    {WEATHER_WORDS[weatherKind(weather.code)]} · {temperatures(weather.max, weather.min)}
                    {weather.rain >= 30 ? ` · ${t('{rain} % de pluie', { rain: Math.round(weather.rain) })}` : ''}
                  </AppText>
                ) : null}
              </Line>
            ) : null}
            {event.contactIds.length > 0 ? (
              <Line icon="people">
                <View style={styles.people}>
                  {event.contactIds.map(id => {
                    const contact = resolveContact(people, id);
                    return <PersonChip key={id} contact={contact} onPress={contact ? () => later(openInApp('contacts', contactPlace(contact.id))) : undefined} />;
                  })}
                </View>
              </Line>
            ) : null}
            {event.reminders.length > 0 ? (
              <Line icon="bell">
                {/* One reminder a line, as the form lists them. */}
                {event.reminders.map(minutes => (
                  <AppText key={minutes} variant="body">
                    {reminderWords(minutes, occurrence.allDay)}
                  </AppText>
                ))}
              </Line>
            ) : null}
            {/* Its labels need no glyph before them: each wears its own tag, the row starting where the glyphs do. */}
            {wornLabels.length > 0 ? (
              <View style={styles.labels} accessible accessibilityLabel={t('Libellés : {names}', { names: wornLabels.map(label => label.name).join(', ') })}>
                {wornLabels.map(label => (
                  <WornLabel key={label.id} name={label.name} color={label.color} />
                ))}
              </View>
            ) : null}
            {feed ? (
              <Line icon="calendar">
                <AppText variant="body">{feedName(feed) || t('Agenda sans nom')}</AppText>
                <AppText variant="meta">{t('Agenda abonné : en lecture seule')}</AppText>
                {/* Read-only: its copy in sight, where it says so (the menu keeps it too). */}
                <Button kind="tonal" small icon="copy" label={t('Copier dans mon agenda')} onPress={copy} style={styles.copy} />
              </Line>
            ) : null}
            {/* Its description in the same order as the web's: after the calendar, before the files and the link. */}
            {event.description.trim() ? (
              <Line icon="text">
                <RichView markup={event.description} now={now} onRef={target => openRef(target, id => navigation.push('Event', { id }))} />
              </Line>
            ) : null}
            {event.files.map(file => (
              <Line key={file.id} icon={file.mime.startsWith('image/') ? 'image' : file.mime === 'application/pdf' ? 'pdf' : 'file'} label={file.name} onPress={() => openFile(file.uploaded)}>
                <AppText variant="body" numberOfLines={1}>
                  {file.name}
                </AppText>
                {!file.uploaded ? <AppText variant="meta">{t('En attente d’envoi')}</AppText> : null}
              </Line>
            ))}
            {event.url.trim() ? (
              <Line icon="link" label={event.url} onPress={() => openEventLink(event.url)}>
                <AppText variant="body" numberOfLines={1}>
                  <AppText variant="bodyStrong" color={theme.color.link}>
                    {linkParts(event.url.trim()).host}
                  </AppText>
                  <AppText variant="body" color={theme.color.inkMuted}>
                    {linkParts(event.url.trim()).rest}
                  </AppText>
                </AppText>
              </Line>
            ) : null}
          </Organic>
        ) : null}

        <MentionedIn id={occurrence.seriesId} />

        {pages && !trashed ? (
          <View style={styles.actions}>
            <Button label={t('Créer une page de notes')} icon="pagePlus" kind="tonal" busy={making} onPress={() => later(meetingPage())} />
          </View>
        ) : null}
      </ScrollView>
      <Menu visible={menu} items={menuItems} onDismiss={() => setMenu(false)} />
      <ScopeSheet visible={scoping} deleting onDismiss={() => setScoping(false)} onScope={remove} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingBottom: 48, gap: 16 },
    // Its stone over the rows' glyphs and its words on their text column (the panel's 12, a row's 16, a 24 slot, 16), as Google's event.
    head: { flexDirection: 'row', gap: 16, paddingHorizontal: 28, paddingTop: 4 },
    stoneSlot: { width: 24, alignItems: 'center', paddingTop: 6 },
    stone: { width: 26, height: 24 },
    when: { marginTop: 4 },
    placeLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    shrink: { flexShrink: 1 },
    // 8 apart, as the labels' chips.
    people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    fill: { flex: 1, gap: 2 },
    panel: { marginHorizontal: 12, paddingVertical: 8, backgroundColor: theme.color.paper },
    // A list row's geometry (6 in, 10, a 24 glyph slot, 16): the words on the form's text column.
    line: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, minHeight: 52, paddingHorizontal: 10, paddingVertical: 10, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    lineIcon: { width: 24, alignItems: 'center', paddingTop: 1 },
    // The labels as chips from the glyphs' edge, wrapping when there are many.
    labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2 },
    worn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, maxWidth: '100%', paddingLeft: 12, paddingRight: 14, ...corners(SHAPES.chip) },
    // On the panels' edge.
    actions: { paddingHorizontal: 12 },
    // A breath under the read-only line's words (the web's `.detailButton`).
    copy: { marginTop: 6 },
    // Its glyph and words on the rows' columns.
    binned: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 12, paddingLeft: 16, paddingRight: 4, paddingVertical: 6, minHeight: 56, backgroundColor: theme.color.paper, overflow: 'hidden' },
  });
