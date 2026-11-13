/**
 * « Autres agendas »: the calendars subscribed to by their address (Google's « Adresse secrète au
 * format iCal », any iCalendar address, or a calendar behind a login, read over CalDAV: a mailbox's,
 * Nextcloud's), read by the server and kept read-only here, each shown or
 * hidden on every device, renamed, coloured, read again now or unsubscribed; the public holidays
 * (set in the Administration) among them. A file rather than an address goes to the import, its
 * events copied once (`paths.importer`). An address is tried by the server before it is followed:
 * one that asks for a login shows the login's fields, one that opens several calendars asks which; a
 * failure is said in the form, nothing followed. A CalDAV calendar's login can be given again from
 * its row (a password changed); the password stays on the server.
 */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { HOLIDAYS_FEED_ID, type CalendarFeed } from '@unlease/calendar/models/events';
import { feedAddress, feedNameFrom } from '@unlease/calendar/services/feeds';
import { feedName } from '@unlease/calendar/services/holidays';
import { FEED_LOGIN_LIMITS, type FeedConnectResponse } from '@unlease/calendar/sync/routes';
import { createId } from '@unlease/core/services/ids';

import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showError, showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { SelectField } from '@shared/ui/components/SelectField';
import { Switch } from '@shared/ui/components/Checkbox';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { IconButton } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { TextField } from '@shared/ui/components/TextField';
import { useForm, type FieldBinding, type SaveOutcome } from '@shared/ui/components/useForm';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { adminPath, Link, navigate, paths as shellPaths } from '@shared/ui/router';
import { connectFeed, refreshFeed } from '../../app/api';
import { addFeed, deleteFeed, renameFeed, setFeedAccount, setFeedColor, setFeedHidden } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { ColorPicker } from '../features/ColorPicker';
import { NameField } from '../features/NameField';

/** A calendar's state in a line: read when, or why not, or waiting for the server. */
export function feedState(feed: CalendarFeed, now: number): string {
  if (feed.error) return t(feed.error);
  if (feed.refreshedAt === null) return t('Waiting for the server’s first reading…');
  return t('Read {when}', { when: formatRelative(feed.refreshedAt, now) });
}

const failure = (error: unknown): string => (error instanceof Error && error.message ? error.message : t('The server isn’t responding'));

/** A login's two fields, as the form and a row's « Changer l'identifiant » ask them. */
function LoginFields({ username, password, onUsername, onPassword, form }: { username: string; password: string; onUsername: (value: string) => void; onPassword: (value: string) => void; form: { field: (name: 'username' | 'password') => FieldBinding } }) {
  return (
    <>
      <TextField label={t('Login')} kind="email" autoComplete="username" value={username} onChange={onUsername} field={form.field('username')} maxLength={FEED_LOGIN_LIMITS.username} placeholder="lea@example.org" />
      <TextField
        label={t('Password')}
        kind="secret"
        autoComplete="current-password"
        value={password}
        onChange={onPassword}
        field={form.field('password')}
        maxLength={FEED_LOGIN_LIMITS.password}
        help={t('Kept by your server alone, never on your devices. If your account offers them, prefer an app password.')}
      />
    </>
  );
}

/** « Changer l'identifiant »: a CalDAV calendar's login given again (its password changed), tried before it is kept. */
function FeedLoginForm({ feed, onDone }: { feed: CalendarFeed; onDone: () => void }) {
  const server = useSettingsStore(selectServer);
  const [username, setUsername] = useState(feed.account);
  const [password, setPassword] = useState('');
  const form = useForm({
    username: username.trim() ? null : t('Your login on that server.'),
    password: password ? null : t('Its password.'),
  });
  const save = async (): Promise<SaveOutcome> => {
    if (!server) return false;
    try {
      const answer = await connectFeed(server, { id: feed.id, url: feed.url, login: { username: username.trim(), password } });
      if (answer.status !== 'ready') {
        form.fail(null, t('This login no longer opens this calendar.'));
        return false;
      }
    } catch (error) {
      form.fail(null, failure(error));
      return false;
    }
    setFeedAccount(feed.id, username.trim());
    showSnack(t('Login saved: the server is reading the calendar again.'), undefined, { tone: 'success' });
    onDone();
  };
  return (
    <form className={styles.form} onSubmit={form.onSubmit(save)} noValidate>
      <LoginFields username={username} password={password} onUsername={setUsername} onPassword={setPassword} form={form} />
      <div className={styles.formFoot}>
        <FormMessage form={form} className={styles.footMessage} />
        <Button kind="text" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button type="submit" busy={form.busy}>
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}

function FeedRow({ feed }: { feed: CalendarFeed }) {
  const now = useMinute();
  const server = useSettingsStore(selectServer);
  const [busy, setBusy] = useState(false);
  const [relogging, setRelogging] = useState(false);
  const caldav = feed.kind === 'caldav';
  const holidays = feed.id === HOLIDAYS_FEED_ID;
  const refresh = async (): Promise<void> => {
    if (!server) return;
    setBusy(true);
    try {
      await refreshFeed(server, feed.id);
      showSnack(t('Calendar read again'), undefined, { tone: 'success' });
    } catch (error) {
      showError(error instanceof Error ? error.message : t('The server isn’t responding'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={styles.item}>
      {/* Its switch, its name (in its field: a list of names needs no « Nom » over each) and its tools on one line, centred on the field. */}
      <div className={styles.itemHead}>
        <span className={styles.itemLine}>
          <Switch checked={!feed.hidden} onChange={on => setFeedHidden(feed.id, !on)} label={t('Show {name}', { name: feedName(feed) })} />
        </span>
        {holidays ? (
          <span className={`${styles.itemName} ${styles.itemLine} t-body-strong`}>{feedName(feed)}</span>
        ) : (
          <div className={styles.itemName}>
            <NameField ariaLabel={t('Name')} value={feed.name} onSave={value => renameFeed(feed.id, value)} maxLength={200} />
          </div>
        )}
        <span className={styles.itemLine}>
          {caldav ? <IconButton icon="key" label={t('Change the login of {name}', { name: feedName(feed) })} disabled={!server} pressed={relogging} onClick={() => setRelogging(on => !on)} /> : null}
          <IconButton icon="refresh" label={t('Read again now')} disabled={busy || !server} onClick={() => void refresh()} />
          {holidays ? null : <IconButton icon="trash" label={t('Unsubscribe from {name}', { name: feed.name })} onClick={() => showUndo(t('Unsubscribed'), deleteFeed(feed.id))} />}
        </span>
      </div>
      <div className={styles.itemNotes}>
        <p className="t-meta">{feedState(feed, now)}</p>
        {holidays ? (
          <Link to={adminPath('calendar-holidays')} className="t-meta">
            {t('Country and region: in the Administration')}
          </Link>
        ) : (
          <p className={`${styles.itemAddress} t-meta`}>{caldav && feed.account ? t('{address} · as {account}', { address: feed.url, account: feed.account }) : feed.url}</p>
        )}
      </div>
      {relogging ? <FeedLoginForm feed={feed} onDone={() => setRelogging(false)} /> : null}
      <ColorPicker label={t('Colour of {name}', { name: feedName(feed) })} value={feed.color} onChange={color => setFeedColor(feed.id, color)} />
    </li>
  );
}

export function FeedsScreen() {
  const feeds = useCalendarStore(s => s.feeds);
  const live = useMemo(() => Object.values(feeds).filter(feed => feed.deletedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1)), [feeds]);
  const server = useSettingsStore(selectServer);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
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
  const form = useForm({
    url: !url.trim() ? t('Paste the calendar’s address.') : !address ? t('An address starting with https:// or webcal://, such as https://example.org/calendar.ics.') : live.some(feed => feed.url === address) ? t('You already subscribe to this address.') : null,
    username: login && !username.trim() ? t('Your login on that server.') : null,
    password: login && !password ? t('Its password.') : null,
  });
  const changeUrl = (value: string): void => {
    setUrl(value);
    setStep('address');
  };
  const add = async (): Promise<SaveOutcome> => {
    if (!address) return false;
    if (!server) {
      form.fail(null, t('Connect a server first: it is the one that reads the calendar.'));
      return false;
    }
    const id = pendingId ?? createId();
    setPendingId(id);
    const given = login ? { username: username.trim(), password } : undefined;
    const target = step === 'choose' && chosen ? chosen : address;
    let answer: FeedConnectResponse;
    try {
      answer = await connectFeed(server, { id, url: target, ...(given ? { login: given } : {}) });
    } catch (error) {
      form.fail(login ? null : 'url', failure(error));
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
    if (live.some(feed => feed.url === answer.url)) {
      form.fail(null, t('You already subscribe to this calendar.'));
      return false;
    }
    addFeed(answer.url, name.trim() || answer.name || feedNameFrom(answer.url), null, undefined, { id, kind: answer.kind, account: given?.username ?? '' });
    setPendingId(null);
    setUrl('');
    setName('');
    setUsername('');
    setPassword('');
    setStep('address');
    form.reset();
    showSnack(t('Subscribed: the server is reading the calendar, its events arrive in a moment.'), undefined, { tone: 'success' });
  };
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Other calendars')} />
      <p className={`${styles.lead} t-body`}>
        {t('Subscribe to a calendar by its address: in Google Calendar, the calendar’s Settings, “Secret address in iCal format”; or a CalDAV calendar’s (a mailbox’s, Nextcloud’s…), with its login. The server reads it again every six hours; its events stay read-only.')}
      </p>
      <form className={styles.form} onSubmit={form.onSubmit(add)} noValidate>
        <TextField
          label={t('Calendar address')}
          kind="url"
          value={url}
          onChange={changeUrl}
          field={form.field('url')}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        />
        {login ? (
          <>
            <p className="t-body">{step === 'choose' ? t('This login opens several calendars: which one to follow?') : t('This calendar asks for a login: the one of the account that holds it.')}</p>
            {step === 'choose' ? <SelectField label={t('Calendar')} value={chosen} options={calendars.map(calendar => ({ value: calendar.url, label: calendar.name || calendar.url }))} onChange={setChosen} /> : null}
            <LoginFields username={username} password={password} onUsername={setUsername} onPassword={setPassword} form={form} />
          </>
        ) : null}
        <TextField label={t('Name')} optional value={name} onChange={setName} maxLength={200} placeholder={address ? feedNameFrom(address) : t('Work, Football club…')} />
        <div className={styles.formFoot}>
          <FormMessage form={form} className={styles.footMessage} />
          <Button type="submit" icon="plus" disabled={!url.trim()} busy={form.busy}>
            {t('Subscribe')}
          </Button>
        </div>
      </form>
      {/* The other way a calendar comes: a file, its events copied once, not followed. */}
      <div className={styles.feedsImport}>
        <p className="t-meta">{t('An .ics file rather than an address? Its events are copied into your calendar, once.')}</p>
        <Button kind="tonal" icon="download" onClick={() => navigate(shellPaths.importer)}>
          {t('Import an .ics file')}
        </Button>
      </div>
      {live.length === 0 ? (
        <EmptyState scene="reminders" title={t('No other calendars')} text={t('The calendars you subscribe to, and the public holidays, appear here.')} />
      ) : (
        <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
          <ul className={styles.list}>
            {live.map(feed => (
              <FeedRow key={feed.id} feed={feed} />
            ))}
          </ul>
        </OutlinedBox>
      )}
    </div>
  );
}
