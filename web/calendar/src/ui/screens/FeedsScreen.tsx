/**
 * « Autres agendas »: the calendars subscribed to by their address (Google's « Adresse secrète au
 * format iCal », any iCalendar address), read by the server and kept read-only here, each shown or
 * hidden on every device, renamed, coloured, read again now or unsubscribed; the public holidays
 * (set in the Administration) among them.
 */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { HOLIDAYS_FEED_ID, type CalendarFeed } from '@unlease/calendar/models/events';
import { feedAddress, feedNameFrom } from '@unlease/calendar/services/feeds';
import { feedName } from '@unlease/calendar/services/holidays';

import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showError, showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Switch } from '@shared/ui/components/Checkbox';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { IconButton } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { adminPath, Link } from '@shared/ui/router';
import { refreshFeed } from '../../app/api';
import { addFeed, deleteFeed, renameFeed, setFeedColor, setFeedHidden } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { ColorPicker } from '../features/ColorPicker';
import { NameField } from '../features/NameField';

/** A calendar's state in a line: read when, or why not, or waiting for the server. */
export function feedState(feed: CalendarFeed, now: number): string {
  if (feed.error) return t(feed.error);
  if (feed.refreshedAt === null) return t('En attente de la première lecture par le serveur…');
  return t('Lu {when}', { when: formatRelative(feed.refreshedAt, now) });
}

function FeedRow({ feed }: { feed: CalendarFeed }) {
  const now = useMinute();
  const server = useSettingsStore(selectServer);
  const [busy, setBusy] = useState(false);
  const holidays = feed.id === HOLIDAYS_FEED_ID;
  const refresh = async (): Promise<void> => {
    if (!server) return;
    setBusy(true);
    try {
      await refreshFeed(server, feed.id);
      showSnack(t('Agenda relu'), undefined, { tone: 'success' });
    } catch (error) {
      showError(error instanceof Error ? error.message : t('Le serveur ne répond pas'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={styles.item}>
      {/* Its switch, its name (in its field: a list of names needs no « Nom » over each) and its tools on one line, centred on the field. */}
      <div className={styles.itemHead}>
        <span className={styles.itemLine}>
          <Switch checked={!feed.hidden} onChange={on => setFeedHidden(feed.id, !on)} label={t('Afficher {name}', { name: feedName(feed) })} />
        </span>
        {holidays ? (
          <span className={`${styles.itemName} ${styles.itemLine} t-body-strong`}>{feedName(feed)}</span>
        ) : (
          <div className={styles.itemName}>
            <NameField ariaLabel={t('Nom')} value={feed.name} onSave={value => renameFeed(feed.id, value)} maxLength={200} />
          </div>
        )}
        <span className={styles.itemLine}>
          <IconButton icon="refresh" label={t('Relire maintenant')} disabled={busy || !server} onClick={() => void refresh()} />
          {holidays ? null : <IconButton icon="trash" label={t('Se désabonner de {name}', { name: feed.name })} onClick={() => showUndo(t('Désabonné'), deleteFeed(feed.id))} />}
        </span>
      </div>
      <div className={styles.itemNotes}>
        <p className="t-meta">{feedState(feed, now)}</p>
        {holidays ? (
          <Link to={adminPath('calendar-holidays')} className="t-meta">
            {t('Pays et région : dans l’Administration')}
          </Link>
        ) : (
          <p className={`${styles.itemAddress} t-meta`}>{feed.url}</p>
        )}
      </div>
      <ColorPicker label={t('Couleur de {name}', { name: feedName(feed) })} value={feed.color} onChange={color => setFeedColor(feed.id, color)} />
    </li>
  );
}

export function FeedsScreen() {
  const feeds = useCalendarStore(s => s.feeds);
  const live = useMemo(() => Object.values(feeds).filter(feed => feed.deletedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1)), [feeds]);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const address = feedAddress(url);
  const form = useForm({
    url: !url.trim() ? t('Collez l’adresse de l’agenda.') : !address ? t('Une adresse qui commence par https:// ou webcal://, comme https://example.org/agenda.ics.') : live.some(feed => feed.url === address) ? t('Vous êtes déjà abonné à cette adresse.') : null,
  });
  const add = (): void => {
    if (!address) return;
    addFeed(address, name.trim() || feedNameFrom(address));
    setUrl('');
    setName('');
    form.reset();
    showSnack(t('Abonné : le serveur lit l’agenda, ses événements arrivent dans un instant.'), undefined, { tone: 'success' });
  };
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Autres agendas')} />
      <p className={`${styles.lead} t-body`}>
        {t('Abonnez-vous à un agenda par son adresse iCalendar : dans Google Agenda, Paramètres de l’agenda, « Adresse secrète au format iCal ». Le serveur le relit toutes les six heures ; ses événements restent en lecture seule.')}
      </p>
      <form className={styles.form} onSubmit={form.onSubmit(add)} noValidate>
        <TextField
          label={t('Adresse de l’agenda')}
          kind="url"
          value={url}
          onChange={setUrl}
          field={form.field('url')}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        />
        <TextField label={t('Nom')} optional value={name} onChange={setName} maxLength={200} placeholder={address ? feedNameFrom(address) : t('Travail, Club de foot…')} />
        <div className={styles.formFoot}>
          <FormMessage form={form} className={styles.footMessage} />
          <Button type="submit" icon="plus" disabled={!url.trim()}>
            {t('S’abonner')}
          </Button>
        </div>
      </form>
      {live.length === 0 ? (
        <EmptyState scene="reminders" title={t('Aucun autre agenda')} text={t('Les agendas auxquels vous vous abonnez, et les jours fériés, apparaissent ici.')} />
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
