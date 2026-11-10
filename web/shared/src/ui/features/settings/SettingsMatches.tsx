/**
 * The settings an app's search finds (`core/services/settingsSearch`): typing « grain », « budget »
 * or « S3 » offers the place of Réglages or of the Administration that holds it. The app's home
 * shows them above its own results, as the phone's search does: a small group « Réglages », three
 * at most until « Tout voir », each row the place's glyph, its name with the words that found it
 * marked, and where it is (« Réglages › Fond »), opening it in one press. The spotlight lists the same
 * places in a group of its own (`settingsRows`).
 */
import { useId, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { findSettings, placesFor, settingsWhere, SETTINGS_SHOWN, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

import { theApp } from '../../../modules';
import { Highlight } from '../../components/Highlight';
import { Icon } from '../../components/Icon';
import { adminPath, Link, paths } from '../../router';
import styles from './settingsMatches.module.css';

export type WebSettingsPlace = SettingsPlace<GlyphName>;

/** The places this app's search finds on the web: every app's, then its own (`AppModule.settingsPlaces`). */
export function appSettingsPlaces(): readonly WebSettingsPlace[] {
  const app = theApp();
  return placesFor(app.id, 'web', app.settingsPlaces ?? []);
}

/** A place's address: a section of the Administration (`/notes/admin/backup`), or Réglages at one of its sections (`/notes/settings#ground`). */
export function settingsPlacePath(place: SettingsPlace<string>): string {
  if (place.area === 'admin') return adminPath(place.section);
  return place.section ? `${paths.settings}#${place.section}` : paths.settings;
}

/** Above the results of an app's home search: the settings the words typed name, if any. */
/** How many settings the words name (the search's summary says « Rien d'autre » under them). */
export function settingsFound(query: string): number {
  return findSettings(appSettingsPlaces(), query).length;
}

export function SettingsMatches({ query }: { query: string }) {
  const places = useMemo(() => appSettingsPlaces(), []);
  const found = useMemo(() => findSettings(places, query), [places, query]);
  // « Tout voir » opens the group whole for what is typed now; typing on, it is short again.
  const [whole, setWhole] = useState<string | null>(null);
  const headId = useId();
  if (found.length === 0) return null;
  const shown = whole === query ? found : found.slice(0, SETTINGS_SHOWN);
  return (
    <section className={styles.group} aria-labelledby={headId}>
      <div className={styles.head}>
        <p id={headId} className="t-meta-strong">
          {t('Réglages')}
        </p>
        {found.length > shown.length ? (
          <button type="button" className={`${styles.all} t-meta-strong`} aria-label={t('Tous les réglages trouvés')} onClick={() => setWhole(query)}>
            {t('Tout voir')}
          </button>
        ) : null}
      </div>
      <ul className={styles.rows}>
        {shown.map(place => {
          const title = t(place.title);
          const where = settingsWhere(place);
          return (
            <li key={place.id}>
              <Link to={settingsPlacePath(place)} className={styles.row}>
                <Icon name={place.glyph} size={24} />
                <span className={styles.text}>
                  <span className="t-body">
                    <Highlight text={title} query={query} />
                  </span>
                  {where ? <span className={`${styles.where} t-meta`}>{where}</span> : null}
                </span>
                <Icon name="chevronRight" size={20} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
