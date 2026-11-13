/**
 * « Mentionné dans »: the pages and the notes that mention the event, the last changed first, each
 * opening in its app. Drawn only once it holds something.
 */
import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import type { MentionPlace } from '@unlease/core/sync/mentions';

import { useMentionedIn } from '../../app/mentions';
import { pathOfRef } from '@shared/modules';
import { Icon } from '@shared/ui/components/Icon';
import { Link } from '@shared/ui/router';
import styles from '../calendar.module.css';

function Place({ place }: { place: MentionPlace }) {
  const path = pathOfRef(place.type, place.id);
  if (!path) return null;
  const title = place.title.trim() || (place.type === 'page' ? t('Untitled') : t('Untitled note'));
  const where = [place.within, APPS[place.app].name].filter(Boolean).join(' · ');
  return (
    <li>
      <Link to={path} className={`${styles.simpleRow} ${styles.placeRow}`} ariaLabel={`${title} · ${where}`}>
        <span className={styles.placeMark} aria-hidden="true">
          {place.icon ?? <Icon name={place.type === 'page' ? 'page' : 'note'} size={22} />}
        </span>
        <span className={styles.rowText}>
          <span className="t-body-strong">{title}</span>
          <span className="t-meta">{where}</span>
        </span>
        <Icon name="external" size={18} />
      </Link>
    </li>
  );
}

export function MentionedIn({ id }: { id: string }) {
  const places = useMentionedIn(id);
  if (!places || places.length === 0) return null;
  return (
    <section aria-label={t('Mentioned in')}>
      <h2 className={`${styles.sectionHead} t-section`}>
        {t('Mentioned in')}
        <span className={`${styles.sectionCount} t-meta tabular`}>{places.length}</span>
      </h2>
      <ul className={styles.list}>
        {places.map(place => (
          <Place key={`${place.app}:${place.type}:${place.id}`} place={place} />
        ))}
      </ul>
    </section>
  );
}
