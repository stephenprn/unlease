/**
 * The calendars one subscribes to (an iCalendar address: Google Agenda's « Adresse secrète au format
 * iCal », a team's, a sports club's) and the public holidays: each shown or hidden on every device, its
 * colour, its name, when the server last read it (or why it could not), read again now, or left. The
 * server reads each address, every few hours; its events are read-only here (« Dupliquer » makes one's
 * own). An address that cannot be read, or one already followed, is said under its field. A calendar
 * linked from a website (`webcal://`) opens here with its address in the field: subscribed only once
 * « S'abonner » is pressed. A file rather than an address goes to the import, its events copied once.
 * With a server, an address is tried before it is followed: one that asks for a login (a calendar
 * read over CalDAV: a mailbox's, Nextcloud's) shows the login's fields, one that opens several
 * calendars asks which; a failure is said in the form. A CalDAV calendar's login can be given again
 * (« Changer l'identifiant »: a password changed); the password stays on the server.
 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { EVENT_LIMITS, HOLIDAYS_FEED_ID } from '@unlease/calendar/models/events';
import { feedAddress, feedNameFrom } from '@unlease/calendar/services/feeds';
import { feedName } from '@unlease/calendar/services/holidays';
import { FEED_LOGIN_LIMITS, type FeedConnectResponse } from '@unlease/calendar/sync/routes';
import { createId } from '@unlease/core/services/ids';
import { subscribe, unsubscribe, updateFeed } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { connectFeed, refreshFeed } from '@app/sync/transport';
import { later } from '@app/later';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, CheckMark, EdgeScrollView, EmptyState, FormFoot, FormMessage, Ground, IconButton, LineColorPicker, ListRow, Organic, Sheet, SHEET_INSET, SwitchMark, TextField, TopBar, useForm, useUnsaved } from '@shared/ui/components';
import type { FieldBinding, SaveOutcome } from '@shared/ui/components/useForm';
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
  const [relogging, setRelogging] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // What the server said of the address: nothing yet, it asks for a login, or which of its calendars.
  const [step, setStep] = useState<Exclude<FeedConnectResponse['status'], 'ready'> | 'address'>('address');
  const [calendars, setCalendars] = useState<readonly { readonly url: string; readonly name: string }[]>([]);
  const [chosen, setChosen] = useState('');
  // The calendar's id from its first try: the server keeps its login under it.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const address = feedAddress(url);
  const login = step !== 'address';
  const followed = (target: string): boolean => Object.values(feeds).some(feed => feed.deletedAt === null && feed.url === target);
  const changeUrl = (value: string): void => {
    setUrl(value);
    setStep('address');
  };
  const done = (): void => {
    setPendingId(null);
    setUrl('');
    setName('');
    setUsername('');
    setPassword('');
    setStep('address');
    form.reset();
  };
  const add = async (): Promise<SaveOutcome> => {
    if (!address) return false;
    // Without a server, followed as it is: the server tries it once linked.
    if (!server) {
      subscribe(address, name.trim() || feedNameFrom(address));
      done();
      showSnack(t('Subscribed: its events will arrive once a server is connected.'), undefined, { tone: 'success' });
      return;
    }
    const id = pendingId ?? createId();
    setPendingId(id);
    const given = login ? { username: username.trim(), password } : undefined;
    const target = step === 'choose' && chosen ? chosen : address;
    let answer: FeedConnectResponse;
    try {
      answer = await connectFeed(server, { id, url: target, ...(given ? { login: given } : {}) });
    } catch (error) {
      form.fail(login ? null : 'url', error instanceof Error && error.message ? error.message : t('Server unreachable'));
      return false;
    }
    if (answer.status === 'login' || answer.status === 'choose') {
      form.reset();
      setStep(answer.status);
      if (answer.status === 'choose') {
        setCalendars(answer.calendars);
        setChosen(answer.calendars[0]!.url);
      }
      return false;
    }
    if (followed(answer.url)) {
      form.fail(null, t('You already subscribe to this calendar.'));
      return false;
    }
    subscribe(answer.url, name.trim() || answer.name || feedNameFrom(answer.url), undefined, { id, kind: answer.kind, account: given?.username ?? '' });
    done();
    showSnack(t('Subscribed: the server is reading the calendar, its events arrive in a moment.'), undefined, { tone: 'success' });
  };

  const form = useForm(
    {
      url: !url.trim()
        ? t('Paste the calendar’s address.')
        : !address
          ? t('An address starting with https:// or webcal://, such as https://example.org/calendar.ics.')
          : followed(address)
            ? t('You already subscribe to this calendar.')
            : null,
      username: login && !username.trim() ? t('Your login on that server.') : null,
      password: login && !password ? t('Its password.') : null,
    },
    { order: login ? ['url', 'username', 'password'] : ['url', 'name'], sendOnDone: add },
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
      showSnack(t('Calendar read again'), undefined, { tone: 'success' });
    } catch (error) {
      showSnack(error instanceof Error && error.message ? t(error.message) : t('Server unreachable'), undefined, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const coloringFeed = coloring ? feeds[coloring] : undefined;
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Other calendars')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title={t('Subscribe to a calendar')}>
            <View style={styles.form}>
              <TextField
                kind="url"
                field={form.field('url')}
                value={url}
                onChangeText={changeUrl}
                label={t('Calendar address')}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                help={t('In Google Calendar on the web: the calendar’s Settings, “Secret address in iCal format”. A webcal:// address, or a CalDAV calendar’s (a mailbox’s, Nextcloud’s…), works too.')}
              />
              {login ? (
                <>
                  <AppText variant="body">{step === 'choose' ? t('This login opens several calendars: which one to follow?') : t('This calendar asks for a login: the one of the account that holds it.')}</AppText>
                  {step === 'choose'
                    ? calendars.map(calendar => (
                        <ListRow
                          key={calendar.url}
                          title={calendar.name || calendar.url}
                          onPress={() => setChosen(calendar.url)}
                          trailing={<CheckMark checked={chosen === calendar.url} />}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: chosen === calendar.url }}
                        />
                      ))
                    : null}
                  <LoginFields form={form} username={username} password={password} onUsername={setUsername} onPassword={setPassword} />
                </>
              ) : null}
              <TextField kind="text" field={form.field('name')} value={name} onChangeText={setName} label={t('Name')} optional maxLength={EVENT_LIMITS.feedName} placeholder={address ? feedNameFrom(address) : t('Work, Football club…')} />
              <FormMessage message={form.message} />
              <View style={styles.submit}>
                <Button label={t('Subscribe')} icon="plus" disabled={!url.trim()} busy={form.busy} onPress={() => later(form.submit(add))} />
              </View>
            </View>
          </Section>
          {/* The other way a calendar comes: a file, its events copied once, not followed. */}
          <Section title={t('From a file')}>
            <ListRow icon="download" title={t('Import an .ics file')} supporting={t('Its events are copied into your calendar, once.')} onPress={() => navigation.navigate('Import')} />
          </Section>
          {order.length > 0 ? (
            <Section title={t('Your calendars')}>
              {order.map(id => {
                const feed = feeds[id];
                if (!feed) return null;
                const holidays = feed.kind === 'holidays';
                const read = feed.error ? t(feed.error) : feed.refreshedAt ? t('Read {when}', { when: formatRelative(feed.refreshedAt, now) }) : t('Not read by the server yet');
                const status = feed.kind === 'caldav' && feed.account ? t('{status} · as {account}', { status: read, account: feed.account }) : read;
                return (
                  <Organic key={id} outline="card" style={styles.feed}>
                    <ListRow
                      title={feedName(feed) || t('Unnamed calendar')}
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
                      {holidays ? null : <IconButton icon="edit" label={t('Rename {name}', { name: feed.name || t('Unnamed calendar') })} onPress={() => setRenaming(id)} />}
                      <IconButton icon="palette" label={t('Colour')} onPress={() => setColoring(id)} />
                      {feed.kind === 'caldav' && server ? <IconButton icon="key" label={t('Change the login of {name}', { name: feedName(feed) || t('Unnamed calendar') })} onPress={() => setRelogging(id)} /> : null}
                      {server ? <IconButton icon="refresh" label={t('Read again now')} disabled={busy === id} onPress={() => later(refresh(id))} /> : null}
                      {holidays ? (
                        <Button label={t('Holidays’ country')} kind="text" onPress={() => navigation.navigate('Admin', { section: 'calendar-holidays' })} />
                      ) : (
                        // As on the web: at once, the slip taking it back.
                        <IconButton icon="trash" label={t('Unsubscribe from {name}', { name: feed.name || t('Unnamed calendar') })} onPress={() => showSnack(t('Unsubscribed'), { label: t('Undo'), run: unsubscribe(id) }, { tone: 'success' })} />
                      )}
                    </View>
                  </Organic>
                );
              })}
            </Section>
          ) : (
            // The web's words, the suite's empty place.
            <EmptyState scene="reminders" title={t('No other calendars')} text={t('The calendars you subscribe to, and the public holidays, appear here.')} />
          )}
          {!order.includes(HOLIDAYS_FEED_ID) ? (
            <AppText variant="meta" style={styles.note}>
              {t('Public holidays are chosen in the Administration, under “Public holidays”.')}
            </AppText>
          ) : null}
        </EdgeScrollView>
      </KeyboardAvoidingView>
      <Sheet visible={coloring !== null} onDismiss={() => setColoring(null)} title={coloringFeed?.name ?? t('Colour')}>
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
      <LoginSheet id={relogging} onDismiss={() => setRelogging(null)} />
    </View>
  );
}

/** A login's two fields, as the form and « Changer l'identifiant » ask them. */
function LoginFields({ form, username, password, onUsername, onPassword }: { form: { field: (name: 'username' | 'password') => FieldBinding }; username: string; password: string; onUsername: (value: string) => void; onPassword: (value: string) => void }) {
  return (
    <>
      <TextField kind="email" field={form.field('username')} value={username} onChangeText={onUsername} label={t('Login')} autoComplete="username" maxLength={FEED_LOGIN_LIMITS.username} placeholder="lea@example.org" />
      <TextField
        kind="secret"
        field={form.field('password')}
        value={password}
        onChangeText={onPassword}
        label={t('Password')}
        autoComplete="current-password"
        maxLength={FEED_LOGIN_LIMITS.password}
        help={t('Kept by your server alone, never on your devices. If your account offers them, prefer an app password.')}
      />
    </>
  );
}

/** « Changer l'identifiant »: a CalDAV calendar's login given again (its password changed), tried before it is kept. */
function LoginSheet({ id, onDismiss }: { id: string | null; onDismiss: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const server = useSettingsStore(selectServer);
  const feed = useLibraryStore(s => (id ? s.feeds[id] : undefined));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  // Opened on a calendar: its account, and a password to type.
  if (id !== shown) {
    setShown(id);
    setUsername(feed?.account ?? '');
    setPassword('');
  }
  const save = async (): Promise<SaveOutcome> => {
    if (!id || !feed || !server) return false;
    try {
      const answer = await connectFeed(server, { id, url: feed.url, login: { username: username.trim(), password } });
      if (answer.status !== 'ready') {
        form.fail(null, t('This login no longer opens this calendar.'));
        return false;
      }
    } catch (error) {
      form.fail(null, error instanceof Error && error.message ? error.message : t('Server unreachable'));
      return false;
    }
    updateFeed(id, { account: username.trim().slice(0, EVENT_LIMITS.feedAccount), error: '' });
    showSnack(t('Login saved: the server is reading the calendar again.'), undefined, { tone: 'success' });
    onDismiss();
  };
  const form = useForm(
    { username: username.trim() ? null : t('Your login on that server.'), password: password ? null : t('Its password.') },
    { order: ['username', 'password'], sendOnDone: save },
  );
  return (
    <Sheet visible={id !== null} onDismiss={onDismiss} title={t('Change the login')}>
      <View style={styles.sheetForm}>
        <LoginFields form={form} username={username} password={password} onUsername={setUsername} onPassword={setPassword} />
      </View>
      <FormFoot message={form.message}>
        <Button label={t('Cancel')} kind="text" onPress={onDismiss} />
        <Button label={t('Save')} busy={form.busy} onPress={() => later(form.submit(save))} />
      </FormFoot>
    </Sheet>
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
  const form = useForm({ name: name.trim() ? null : t('Give it a name.') }, { sendOnDone: save });
  return (
    <>
      <Sheet visible={id !== null} onDismiss={unsaved.guard(onDismiss)} title={t('Rename the calendar')}>
        <View style={styles.sheetForm}>
          <TextField kind="text" label={t('Name')} field={form.field('name')} value={name} onChangeText={setName} maxLength={EVENT_LIMITS.feedName} autoFocus selectTextOnFocus />
        </View>
        <FormFoot message={form.message}>
          <Button label={t('Cancel')} kind="text" onPress={onDismiss} />
          <Button label={t('Rename')} onPress={() => later(form.submit(save))} />
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
    sheetForm: { paddingHorizontal: SHEET_INSET, paddingBottom: 12, gap: 14 },
    submit: { flexDirection: 'row', justifyContent: 'flex-end' },
  });
