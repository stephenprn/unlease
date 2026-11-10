/**
 * The events found by the search box (`searchEvents`): each at its next occurrence (or its last one,
 * when it is over), opening its page. A series is one result.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { searchSummary } from '@unlease/core/services/searchWords';
import { APP_WORDS } from '@unlease/core/appWords';
import { whenLine } from '@unlease/calendar/services/eventText';
import { findOccurrence, upcoming } from '@unlease/calendar/services/occurrences';
import { searchEvents } from '@unlease/calendar/services/search';

import { OutlinedBox } from '@shared/ui/components/Outline';
import { Link } from '@shared/ui/router';
import { settingsFound, SettingsMatches } from '@shared/ui/features/settings/SettingsMatches';
import screens from '@shared/ui/screens/screens.module.css';
import { useMinute } from '@shared/app/hooks/useMinute';
import { useColorOf } from '../../app/hooks/useItems';
import { mentionWords } from '../../app/names';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { paths } from '../routes';

export function SearchResults({ query }: { query: string; today: string }) {
  const { events, feeds } = useCalendarStore();
  const now = useMinute();
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const colorOf = useColorOf();
  const found = useMemo(() => searchEvents(Object.values(events), feeds, query, mentionWords).slice(0, 100), [events, feeds, query]);
  const rows = found.map(event => {
    const next = event.rrule ? upcoming([event], now, 800, 1)[0] : undefined;
    return next ?? findOccurrence(events, event.id, null);
  });
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      {/* As on the phone: the settings the words name, above the events. */}
      <SettingsMatches query={query} />
      {/* As in every app: the count, a line of meta over the results. */}
      <h1 className={`${screens.resultCount} t-meta`} aria-live="polite">
        {searchSummary(query, rows.length, settingsFound(query))}
      </h1>
      {rows.length === 0 ? (
        <p className={`${screens.resultHint} t-meta`}>{APP_WORDS.calendar.searchHint}</p>
      ) : (
        <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
          <ul className={styles.list}>
            {rows.map(item =>
              item ? (
                <li key={item.key}>
                  <Link to={paths.event(item.seriesId, item.repeats ? item.occurrence : null)} className={styles.simpleRow}>
                    <span className={styles.swatch} data-line={colorOf(item) ?? undefined} aria-hidden="true" />
                    <span className={styles.rowText}>
                      <span className="t-body-strong">{item.event.title.trim() || t('Sans titre')}</span>
                      <span className="t-meta">{[whenLine(item, now, twelveHours), item.event.place.trim()].filter(Boolean).join(' · ')}</span>
                    </span>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </OutlinedBox>
      )}
    </div>
  );
}
