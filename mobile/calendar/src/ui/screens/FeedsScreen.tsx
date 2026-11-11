/**
 * The calendars one subscribes to (an iCalendar address: Google Agenda's « Adresse secrète au format
 * iCal », a team's, a sports club's) and the public holidays: each shown or hidden on every device, its
 * colour, its name, when the server last read it (or why it could not), read again now, or left. The
 * server reads each address, every few hours; its events are read-only here (« Dupliquer » makes one's
 * own). An address that cannot be read, or one already followed, is said under its field. A calendar
 * linked from a website (`webcal://`) opens here with its address in the field: subscribed only once
 * « S'abonner » is pressed.
 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { EVENT_LIMITS, HOLIDAYS_FEED_ID } from '@unlease/calendar/models/events';
import { feedAddress, feedNameFrom } from '@unlease/calendar/services/feeds';
import { feedName } from '@unlease/calendar/services/holidays';
import { subscribe, unsubscribe, updateFeed } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { refreshFeed } from '@app/sync/transport';
import { later } from '@app/later';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, EdgeScrollView, EmptyState, FormFoot, Ground, IconButton, LineColorPicker, ListRow, Organic, Sheet, SHEET_INSET, SwitchMark, TextField, TopBar, useForm, useUnsaved } from '@shared/ui/components';
import { FeedStone } from '../features/calendar/FeedStone';
import { Section } from '@shared/ui/features/settings/Section';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

export function FeedsScreen({ navigation, route }: ScreenProps<'Feeds'>) {
  const styles = useThemedStyles(makeStyles);
  const now = useMinute();
  const server = useSettingsStore(selectServer);
  const order = useLibraryStore(s => s.feedOrder);
  const feeds = useLibraryStore(s => s.feeds);
  const [url, setUrl] = useState(route.params?.url ?? '');
  const [name, setName] = useState('');
  const [coloring, setColoring] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const address = feedAddress(url);
  const add = (): void => {
    if (!address) return;
    subscribe(address, name.trim() || feedNameFrom(address));
    setUrl('');
    setName('');
    form.reset();
    showSnack(server ? t('Abonné : le serveur lit l’agenda, ses événements arrivent dans un instant.') : t('Abonné : ses événements arriveront une fois un serveur relié.'), undefined, { tone: 'success' });
  };

  const form = useForm(
    {
      url: !url.trim()
        ? t('Collez l’adresse de l’agenda.')
        : !address
          ? t('Une adresse qui commence par https:// ou webcal://, comme https://example.org/agenda.ics.')
          : Object.values(feeds).some(feed => feed.deletedAt === null && feed.url === address)
            ? t('Vous êtes déjà abonné à cet agenda.')
            : null,
    },
    { order: ['url', 'name'], sendOnDone: add },
  );
  // A linked address reads as one left: if it is already followed, that is said before « S'abonner ».
  const handedUrl = route.params?.url;
  const urlField = form.field('url');
  useEffect(() => {
    if (handedUrl) urlField.left(handedUrl);
  }, [handedUrl, urlField]);

  const refresh = async (id: string): Promise<void> => {
    if (!server) return;
    setBusy(id);
    try {
      await refreshFeed(server, id);
      showSnack(t('Agenda relu'), undefined, { tone: 'success' });
    } catch (error) {
      showSnack(error instanceof Error && error.message ? t(error.message) : t('Serveur injoignable'), undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const coloringFeed = coloring ? feeds[coloring] : undefined;
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Autres agendas')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title={t('S’abonner à un agenda')}>
            <View style={styles.form}>
              <TextField
                kind="url"
                field={form.field('url')}
                value={url}
                onChangeText={setUrl}
                label={t('Adresse de l’agenda (iCal)')}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                help={t('Dans Google Agenda sur le web : Paramètres de l’agenda, « Adresse secrète au format iCal ». Une adresse webcal:// convient aussi.')}
              />
              <TextField kind="text" field={form.field('name')} value={name} onChangeText={setName} label={t('Nom')} optional maxLength={EVENT_LIMITS.feedName} placeholder={address ? feedNameFrom(address) : t('Travail, Club de foot…')} />
              <View style={styles.submit}>
                <Button label={t('S’abonner')} icon="plus" disabled={!url.trim()} onPress={() => later(form.submit(add))} />
              </View>
            </View>
          </Section>
          {order.length > 0 ? (
            <Section title={t('Vos agendas')}>
              {order.map(id => {
                const feed = feeds[id];
                if (!feed) return null;
                const holidays = feed.kind === 'holidays';
                const status = feed.error ? t(feed.error) : feed.refreshedAt ? t('Lu {when}', { when: formatRelative(feed.refreshedAt, now) }) : t('Pas encore lu par le serveur');
                return (
                  <Organic key={id} outline="card" style={styles.feed}>
                    <ListRow
                      title={feedName(feed) || t('Agenda sans nom')}
                      supporting={status}
                      leading={
                        <View style={styles.slot}>
                          <FeedStone id={id} color={feed.color} size={22} />
                        </View>
                      }
                      onPress={() => updateFeed(id, { hidden: !feed.hidden })}
                      trailing={<SwitchMark checked={!feed.hidden} />}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: !feed.hidden }}
                    />
                    <View style={styles.actions}>
                      {holidays ? null : <IconButton icon="edit" label={t('Renommer {name}', { name: feed.name || t('Agenda sans nom') })} onPress={() => setRenaming(id)} />}
                      <IconButton icon="palette" label={t('Couleur')} onPress={() => setColoring(id)} />
                      {server ? <IconButton icon="refresh" label={t('Relire maintenant')} disabled={busy === id} onPress={() => later(refresh(id))} /> : null}
                      {holidays ? (
                        <Button label={t('Pays des jours fériés')} kind="text" onPress={() => navigation.navigate('Admin', { section: 'calendar-holidays' })} />
                      ) : (
                        // As on the web: at once, the slip taking it back.
                        <IconButton icon="trash" label={t('Se désabonner de {name}', { name: feed.name || t('Agenda sans nom') })} onPress={() => showSnack(t('Désabonné'), { label: tc('undo', 'Annuler'), run: unsubscribe(id) }, { tone: 'success' })} />
                      )}
                    </View>
                  </Organic>
                );
              })}
            </Section>
          ) : (
            // The web's words, the suite's empty place.
            <EmptyState scene="reminders" title={t('Aucun autre agenda')} text={t('Les agendas auxquels vous vous abonnez, et les jours fériés, apparaissent ici.')} />
          )}
          {!order.includes(HOLIDAYS_FEED_ID) ? (
            <AppText variant="meta" style={styles.note}>
              {t('Les jours fériés se choisissent dans l’Administration, rubrique « Jours fériés ».')}
            </AppText>
          ) : null}
        </EdgeScrollView>
      </KeyboardAvoidingView>
      <Sheet visible={coloring !== null} onDismiss={() => setColoring(null)} title={coloringFeed?.name ?? t('Couleur')}>
        <View style={styles.sheet}>
          <LineColorPicker
            value={coloringFeed?.color ?? null}
            onChange={color => {
              if (coloring && color) updateFeed(coloring, { color });
              setColoring(null);
            }}
          />
        </View>
      </Sheet>
      <RenameSheet id={renaming} onDismiss={() => setRenaming(null)} />
    </View>
  );
}

/** « Renommer »: a subscription's name, as shown on every device (its events keep coming from its address). */
function RenameSheet({ id, onDismiss }: { id: string | null; onDismiss: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const feed = useLibraryStore(s => (id ? s.feeds[id] : undefined));
  const [name, setName] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  // Opened on a calendar: its name, to change.
  if (id !== shown) {
    setShown(id);
    setName(feed?.name ?? '');
  }
  const unsaved = useUnsaved(id !== null && name !== (feed?.name ?? ''));
  const save = (): void => {
    if (id && name.trim()) updateFeed(id, { name: name.trim().slice(0, EVENT_LIMITS.feedName) });
    unsaved.saved();
    onDismiss();
  };
  const form = useForm({ name: name.trim() ? null : t('Donnez-lui un nom.') }, { sendOnDone: save });
  return (
    <>
      <Sheet visible={id !== null} onDismiss={unsaved.guard(onDismiss)} title={t('Renommer l’agenda')}>
        <View style={styles.sheetForm}>
          <TextField kind="text" label={t('Nom')} field={form.field('name')} value={name} onChangeText={setName} maxLength={EVENT_LIMITS.feedName} autoFocus selectTextOnFocus />
        </View>
        <FormFoot message={form.message}>
          <Button label={t('Annuler')} kind="text" onPress={onDismiss} />
          <Button label={t('Renommer')} onPress={() => later(form.submit(save))} />
        </FormFoot>
      </Sheet>
      {unsaved.dialog}
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
    // As the Administration's fields on their panel: 16 in, 14 apart.
    form: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    feed: { backgroundColor: theme.color.paper, marginVertical: 4 },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 4 },
    // The stone in the glyphs' 24 slot: the name on the rows' text column.
    slot: { width: 24, alignItems: 'center' },
    // On the section titles' column (16 in from the panels).
    note: { paddingHorizontal: 16 },
    // The colours and the name's field on the sheet's column, under its title.
    sheet: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    sheetForm: { paddingHorizontal: SHEET_INSET, paddingBottom: 12 },
    submit: { flexDirection: 'row', justifyContent: 'flex-end' },
  });
