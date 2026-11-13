/**
 * An event's page (`/agenda/event/<id>?at=<occurrence>`, the address Carnet's and Pages' mentions
 * open): its title on its colour's pebble, when it happens in large and how near it is, its actions
 * (« Modifier » first), then its details on a panel, and the pages and notes mentioning it.
 */
import { t } from '@unlease/core/i18n';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { relativeWhen, whenLine } from '@unlease/calendar/services/eventText';
import { findOccurrence } from '@unlease/calendar/services/occurrences';

import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { useLocation } from '@shared/ui/router';
import { useColorOf } from '../../app/hooks/useItems';
import { useNow } from '../../app/hooks/useToday';
import { restore } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { Detail, EventActions, EventDetails, useWhenNotes } from '../features/EventDetails';
import { MentionedIn } from '../features/MentionedIn';

export function EventScreen({ id }: { id: string }) {
  const { search } = useLocation();
  const at = new URLSearchParams(search).get('at');
  const events = useCalendarStore(s => s.events);
  const colorOf = useColorOf();
  const item = findOccurrence(events, id, at);
  if (!item) {
    return (
      <div className={`${styles.screen} ${styles.narrowScreen}`}>
        <EmptyState scene="trash" as="h1" title={t('This event no longer exists')} text={t('It was deleted, on this device or another.')} />
      </div>
    );
  }
  const series = events[item.seriesId]!;
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      {series.trashedAt !== null ? (
        <OutlinedBox kind="panel" className={`${styles.panel} paper`}>
          <Detail icon="trash">
            <span className="t-body">{t('This event is in the bin.')}</span>
            <span>
              <Button kind="text" icon="restore" onClick={() => showUndo(t('Event restored'), restore(series))}>
                {t('Restore')}
              </Button>
            </span>
          </Detail>
        </OutlinedBox>
      ) : null}
      <EventHead item={item} color={colorOf(item)} />
      {series.trashedAt === null ? <EventActions item={item} /> : null}
      <EventBody item={item} />
      <MentionedIn id={item.seriesId} />
    </div>
  );
}

function EventHead({ item, color }: { item: NonNullable<ReturnType<typeof findOccurrence>>; color: string | null }) {
  const { now, today } = useNow();
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const notes = useWhenNotes(item);
  return (
    <header className={styles.hero} data-line={color ?? undefined}>
      <span className={styles.heroSwatch} data-pebble={pebbleTurnOf(item.seriesId)} data-still aria-hidden="true" />
      <div className={styles.heroText}>
        <h1 className={`${styles.heroTitle} t-display`}>{item.event.title.trim() || t('Untitled')}</h1>
        <p className={`${styles.heroWhen} t-title`}>{whenLine(item, now, twelveHours)}</p>
        <p className={`${styles.heroNotes} t-meta`}>
          <span className={styles.heroNear}>{relativeWhen(item, now, today)}</span>
          {notes.map(note => (
            <span key={note}>{note}</span>
          ))}
        </p>
      </div>
    </header>
  );
}

/** The details on their panel, when there is any. */
function EventBody({ item }: { item: NonNullable<ReturnType<typeof findOccurrence>> }) {
  const event = item.event;
  const any = event.place.trim() || event.contactIds.length || event.reminders.length || event.labelIds.length || event.feedId || event.description.trim() || event.files.length || event.url.trim();
  if (!any) return null;
  return (
    <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
      <EventDetails item={item} />
    </OutlinedBox>
  );
}
