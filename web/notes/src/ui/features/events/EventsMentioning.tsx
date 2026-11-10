/**
 * « Dans l’agenda »: the events that mention this page or this note, each with its day and opening in
 * Agenda's web app (a new tab, as another app's place does), the coming ones first. Nothing is drawn
 * while it is asked, nor when there is nothing.
 */
import { t } from '@unlease/core/i18n';
import type { MentionPlace } from '@unlease/core/sync/mentions';
import { shortDay, weekdayDay } from '@unlease/calendar/services/eventText';

import { suitePlace } from '@shared/app/suitePlaces';
import { Icon } from '@shared/ui/components/Icon';
import { browserPath } from '@shared/ui/router';
import { useEventsMentioning } from '../../../app/events/mentioning';
import styles from './events.module.css';

/** The coming events first (the nearest first), then those past (the latest first). */
export function sortByWhen(places: readonly MentionPlace[], today: string): MentionPlace[] {
  const coming = places.filter(place => (place.when ?? '').slice(0, 10) >= today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? -1 : 1));
  const past = places.filter(place => (place.when ?? '').slice(0, 10) < today).sort((a, b) => ((a.when ?? '') < (b.when ?? '') ? 1 : -1));
  return [...coming, ...past];
}

/** « lun. 4 nov. · 14:30 », a place's day as its row says it. */
export function placeWhen(place: MentionPlace, year: number): string {
  if (!place.when) return '';
  const day = place.when.slice(0, 10);
  return place.when.length > 10 ? `${weekdayDay(day, year)} · ${place.when.slice(11, 16)}` : weekdayDay(day, year);
}

export function EventRows({ places }: { places: readonly MentionPlace[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  return (
    <ul className={styles.rows}>
      {sortByWhen(places, today).map(place => {
        const path = suitePlace('event', place.id);
        if (!path) return null;
        const title = place.title.trim() || t('Sans titre');
        const past = (place.when ?? '').slice(0, 10) < today;
        return (
          <li key={place.id}>
            <a className={styles.row} href={browserPath(path)} target="_blank" rel="noopener" data-past={past || undefined} aria-label={`${title} · ${placeWhen(place, year)}`}>
              <Icon name="calendar" size={20} />
              <span className={styles.text}>
                <span className="t-body">{title}</span>
                {place.when ? <span className="t-meta">{placeWhen(place, year) || shortDay(place.when.slice(0, 10))}</span> : null}
              </span>
              <Icon name="external" size={16} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** `className`: where it sits, on its screen's text column (a note's sheet insets it as its words). */
export function EventsMentioning({ type, id, className }: { type: 'page' | 'note'; id: string; className?: string }) {
  const places = useEventsMentioning(type, [id]);
  if (!places || places.length === 0) return null;
  return (
    <section className={[styles.section, className ?? ''].filter(Boolean).join(' ')} aria-label={t('Dans l’agenda')}>
      <h2 className={`${styles.head} t-section`}>{t('Dans l’agenda')}</h2>
      <EventRows places={places} />
    </section>
  );
}
