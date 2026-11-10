/**
 * Events in the spotlight (`@unlease/calendar/services/search`): an event by its title, when it next
 * happens and where under it, its colour as the row's mark; the preview shows what the search read.
 */
import { memo } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { Matcher, SearchDoc } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/core/services/spotlight';
import { whenLine } from '@unlease/calendar/services/eventText';
import { findOccurrence, upcoming } from '@unlease/calendar/services/occurrences';
import { calendarSpotlightDocs } from '@unlease/calendar/services/search';

import { mentionWords } from '../../../app/names';
import { useCalendarStore, type CalendarState } from '../../../app/store/library';
import { Marked } from '@shared/ui/features/spotlight/Preview';
import spot from '@shared/ui/features/spotlight/spotlight.module.css';
import { navigate } from '@shared/ui/router';
import type { SpotKind } from '@shared/modules';
import { eventColor } from '@unlease/calendar/services/colors';
import styles from '../../calendar.module.css';
import { paths } from '../../routes';

let cached: { readonly state: CalendarState; readonly docs: readonly SearchDoc<SpotMeta>[] } | null = null;

function docs(): readonly SearchDoc<SpotMeta>[] {
  const state = useCalendarStore.getState();
  if (cached && cached.state.events === state.events && cached.state.labels === state.labels && cached.state.feeds === state.feeds) return cached.docs;
  const made = calendarSpotlightDocs(Object.values(state.events), state.labels, state.feeds, mentionWords);
  cached = { state, docs: made };
  return made;
}

/** The occurrence a result opens: its next one, else its first. */
function shownOccurrence(id: string) {
  const { events } = useCalendarStore.getState();
  const event = events[id];
  if (!event) return null;
  return (event.rrule ? upcoming([event], Date.now(), 800, 1)[0] : undefined) ?? findOccurrence(events, id, null);
}

const EventMark = memo(function EventMark({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  const event = useCalendarStore(s => s.events[doc.meta.id]);
  const { labels, feeds } = useCalendarStore.getState();
  const color = event ? eventColor(event, labels, feeds) : null;
  const size = large ? 28 : 16;
  return <span className={styles.swatch} data-line={color ?? undefined} style={{ width: size, height: size }} aria-hidden="true" />;
});

function EventPreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  if (doc.parts.length === 0) return <p className={`${spot.quiet} t-meta`}>{t('Rien d’autre que son titre')}</p>;
  return (
    <div className={spot.pageBody}>
      {doc.parts.map((part, at) => (
        <p key={at} className={`${spot.blockText} t-body`}>
          <Marked text={part.text} matcher={matcher} />
        </p>
      ))}
    </div>
  );
}

const href = (doc: SearchDoc<SpotMeta>): string => {
  const item = shownOccurrence(doc.meta.id);
  return paths.event(doc.meta.id, item?.repeats ? item.occurrence : null);
};

export const CALENDAR_SPOT_KINDS: readonly SpotKind[] = [
  {
    type: 'event',
    label: tx('Événements'),
    docs,
    title: doc => useCalendarStore.getState().events[doc.meta.id]?.title.trim() || doc.title || t('Sans titre'),
    facts: doc => {
      const item = shownOccurrence(doc.meta.id);
      if (!item) return [t('Événement')];
      return [whenLine(item, Date.now(), false), ...(item.event.place.trim() ? [item.event.place.trim()] : []), ...(doc.meta.within ? [doc.meta.within] : [])];
    },
    href,
    open: doc => navigate(href(doc)),
    Mark: EventMark,
    Preview: EventPreview,
  },
];
