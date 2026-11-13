/**
 * « Vus ensemble »: the events (Agenda) the person is with or that mention them, by their day; and
 * « Mentionné dans »: the pages (Pages) and the notes (Carnet) that mention the person, the last
 * changed first. Each opens in its app. Asked of the server as the page opens; drawn only once it
 * holds something (nothing shows while it is asked, nor when there is nothing).
 */
import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { weekdayDay } from '@unlease/calendar/services/eventText';

import { useMentionedIn } from '../../app/mentions';
import { pathOfRef } from '@shared/modules';
import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { Link } from '@shared/ui/router';
import styles from '../contacts.module.css';

/** A place's glyph by what it is: a page, a link, else a note. */
const placeGlyph = (type: string): 'page' | 'link' | 'note' => (type === 'page' ? 'page' : type === 'link' ? 'link' : 'note');

function Place({ place }: { place: MentionPlace }) {
  const path = pathOfRef(place.type, place.id);
  if (!path) return null;
  const title = place.title.trim() || (place.type === 'page' ? t('Untitled') : place.type === 'link' ? t('Untitled link') : t('Untitled note'));
  // A note or a link naming the person among its people (a gift idea) says so before where it sits.
  const where = [place.linked ? t('Linked') : '', place.within, APPS[place.app].name].filter(Boolean).join(' · ');
  return (
    <li>
      <Link to={path} className={`${styles.simpleRow} ${styles.placeRow}`} ariaLabel={`${title} · ${where}`}>
        <span className={styles.placeMark} aria-hidden="true">
          {place.icon ?? <Icon name={placeGlyph(place.type)} size={22} />}
        </span>
        <span className={styles.nameCell}>
          <span className={`${styles.cell} t-body-strong`}>{title}</span>
          <span className={`${styles.cell} t-meta`}>{where}</span>
        </span>
        <Icon name="external" size={18} />
      </Link>
    </li>
  );
}

/** An event the person is with, its day; the coming ones first. */
function EventPlace({ place, today }: { place: MentionPlace; today: string }) {
  const path = pathOfRef('event', place.id);
  if (!path) return null;
  const title = place.title.trim() || t('Untitled');
  const day = (place.when ?? '').slice(0, 10);
  const when = day ? `${weekdayDay(day, Number(today.slice(0, 4)))}${place.when!.length > 10 ? ` · ${place.when!.slice(11, 16)}` : ''}` : APPS.calendar.name;
  return (
    <li>
      <Link to={path} className={`${styles.simpleRow} ${styles.placeRow}`} ariaLabel={`${title} · ${when}`}>
        <span className={styles.placeMark} aria-hidden="true">
          <Icon name="calendar" size={22} />
        </span>
        <span className={styles.nameCell}>
          <span className={`${styles.cell} t-body-strong`}>{title}</span>
          <span className={`${styles.cell} t-meta`}>{when}</span>
        </span>
        <Icon name="external" size={18} />
      </Link>
    </li>
  );
}

/** « Vus ensemble »: the events the person is with or that mention them, the coming ones first (the nearest first), then those past. */
function SeenTogether({ places }: { places: readonly MentionPlace[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const coming = places.filter(place => (place.when ?? '').slice(0, 10) >= today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? -1 : 1));
  const past = places.filter(place => (place.when ?? '').slice(0, 10) < today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? 1 : -1));
  return (
    <section className={styles.block} aria-label={t('Seen together')}>
      <h2 className={`${styles.sectionHead} t-section`}>
        {t('Seen together')}
        <span className={`${styles.sectionCount} t-meta tabular`}>{places.length}</span>
      </h2>
      <OutlinedBox kind="panel" lift="card" className={`${styles.table} paper`}>
        <ul className={styles.group}>
          {[...coming, ...past].map(place => (
            <EventPlace key={place.id} place={place} today={today} />
          ))}
        </ul>
      </OutlinedBox>
    </section>
  );
}

export function MentionedIn({ id }: { id: string }) {
  const all = useMentionedIn(id);
  if (!all || all.length === 0) return null;
  const events = all.filter(place => place.app === 'calendar');
  const places = all.filter(place => place.app !== 'calendar');
  return (
    <>
      {events.length > 0 ? <SeenTogether places={events} /> : null}
      {places.length > 0 ? <Mentions places={places} /> : null}
    </>
  );
}

function Mentions({ places }: { places: readonly MentionPlace[] }) {
  return (
    <section className={styles.block} aria-label={t('Mentioned in')}>
      <h2 className={`${styles.sectionHead} t-section`}>
        {t('Mentioned in')}
        <span className={`${styles.sectionCount} t-meta tabular`}>{places.length}</span>
      </h2>
      <OutlinedBox kind="panel" lift="card" className={`${styles.table} paper`}>
        <ul className={styles.group}>
          {places.map(place => (
            <Place key={`${place.app}:${place.type}:${place.id}`} place={place} />
          ))}
        </ul>
      </OutlinedBox>
    </section>
  );
}
