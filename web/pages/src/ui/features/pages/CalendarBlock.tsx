/**
 * A calendar block (`calendar`): Agenda's next events, a label's or all of them, for 7, 14 or 30
 * days, grouped by day as a short schedule (`pages/services/calendarBlock`). Each opens in Agenda's
 * web app. Its label and its days are chosen in its head; nothing else is stored in it, so it shows
 * the calendar as it is now on every device.
 */
import { useMemo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/pages/models/blocks';
import { CALENDAR_BLOCK_DAYS } from '@unlease/pages/models/blocks';
import { calendarBlockDays, calendarBlockLabel, calendarLabels } from '@unlease/pages/services/calendarBlock';
import { dayDistance, timeRange, weekdayDay } from '@unlease/calendar/services/eventText';
import { dayToInstant } from '@unlease/calendar/services/time';

import { useEventsStore } from '@notes/app/events/store';
import { updateBlock } from '../../../app/store/pages';
import { suitePlace } from '@shared/app/suitePlaces';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { Segmented } from '@shared/ui/components/Segmented';
import { browserPath } from '@shared/ui/router';
import { usePageContext } from './PageContext';
import { useToday } from './today';
import styles from './pages.module.css';

/** An occurrence's address in Agenda: the event, at this occurrence when it repeats. */
function eventHref(seriesId: string, occurrence: string, repeats: boolean): string {
  const path = suitePlace('event', seriesId) ?? '/agenda';
  return browserPath(repeats ? `${path}?at=${encodeURIComponent(occurrence)}` : path);
}

export function CalendarBlock({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const events = useEventsStore(s => s.events);
  const labels = useEventsStore(s => s.labels);
  const feeds = useEventsStore(s => s.feeds);
  // From today's midnight, so the day's events all show; it turns at midnight.
  const today = useToday();
  const days = useMemo(() => calendarBlockDays({ events, labels, feeds }, block, dayToInstant(today)), [events, labels, feeds, block, today]);
  const label = calendarBlockLabel({ labels }, block);
  const [picking, setPicking] = useState(false);
  const labelButton = useRef<HTMLButtonElement>(null);
  const year = Number(today.slice(0, 4));

  const labelItems: MenuItem[] = [
    { label: t('Tous les événements'), icon: block.calendarLabelId === null ? 'check' : 'calendar', onSelect: () => updateBlock(page, block.id, { calendarLabelId: null }) },
    ...calendarLabels(labels).map(each => ({
      label: each.name,
      icon: each.id === block.calendarLabelId ? ('check' as const) : ('tag' as const),
      mark: each.id === block.calendarLabelId ? undefined : <LabelTag color={each.color} />,
      onSelect: () => updateBlock(page, block.id, { calendarLabelId: each.id }),
    })),
  ];

  return (
    <section className={styles.calendarBlock} data-outline="frame" aria-label={t('Agenda')}>
      <header className={styles.calendarHead}>
        <Icon name="calendar" size={20} />
        <span className="t-body-strong">{label ? label.name : t('Agenda')}</span>
        {readOnly ? null : (
          <>
            <button ref={labelButton} type="button" className={`${styles.calendarPick} t-meta`} aria-haspopup="menu" onClick={() => setPicking(true)}>
              {label ? t('Libellé') : t('Tous les événements')}
              <Icon name="chevronDown" size={16} />
            </button>
            <Menu open={picking} anchor={labelButton} onDismiss={() => setPicking(false)} items={labelItems} label={t('Événements montrés')} align="start" />
            <Segmented
              label={t('Jours montrés')}
              value={String(block.calendarDays)}
              options={CALENDAR_BLOCK_DAYS.map(count => ({ value: String(count), label: t('{count} j', { count }) }))}
              onChange={value => updateBlock(page, block.id, { calendarDays: Number(value) })}
            />
          </>
        )}
        <a className={`${styles.calendarOpen} t-meta`} href={browserPath('/agenda')} target="_blank" rel="noopener">
          {t('Ouvrir l’agenda')}
        </a>
      </header>
      {days.length === 0 ? (
        <EmptyLine className={styles.calendarEmpty} text={t('Rien de prévu les {count} prochains jours.', { count: block.calendarDays })} />
      ) : (
        <ol className={styles.calendarDays}>
          {days.map(({ day, items }) => (
            <li key={day}>
              <h4 className={`${styles.calendarDay} t-meta-strong`}>
                {weekdayDay(day, year)}
                <span className="t-meta"> · {dayDistance(day, today)}</span>
              </h4>
              <ul className={styles.calendarItems}>
                {items.map(({ occurrence, color }) => (
                  <li key={occurrence.key}>
                    <a className={styles.calendarItem} href={eventHref(occurrence.seriesId, occurrence.occurrence, occurrence.repeats)} target="_blank" rel="noopener">
                      <span className={styles.calendarDot} data-line={color ?? undefined} aria-hidden="true" />
                      <span className={`${styles.calendarTime} t-meta`}>{timeRange(occurrence)}</span>
                      <span className="t-body">{occurrence.event.title.trim() || t('Sans titre')}</span>
                      {occurrence.event.place.trim() ? <span className="t-meta"> · {occurrence.event.place.trim()}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
