/** A label's events: their occurrences ahead, as the planning lists them. */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { hiddenFeedIds, occurrencesIn } from '@unlease/calendar/services/occurrences';
import { addDays } from '@unlease/calendar/services/time';

import { EmptyState } from '@shared/ui/components/EmptyState';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { useNow } from '../../app/hooks/useToday';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { ScheduleList } from '../views/ScheduleView';

const DAYS = 365;

export function LabelScreen({ id }: { id: string }) {
  const { today } = useNow();
  const { events, labels, feeds } = useCalendarStore();
  const label = labels[id];
  const items = useMemo(() => occurrencesIn(Object.values(events), today, addDays(today, DAYS), { hiddenFeeds: hiddenFeedIds(Object.values(feeds)), labelId: id }), [events, feeds, id, today]);
  if (!label || label.deletedAt !== null) {
    return (
      <div className={`${styles.screen} ${styles.narrowScreen}`}>
        <EmptyState scene="label" as="h1" title={t('This label no longer exists')} text={t('It was deleted, on this device or another.')} />
      </div>
    );
  }
  return (
    <div className={styles.calendar}>
      <PageHead title={label.name} />
      <ScheduleList from={today} days={DAYS} items={items} today={today} />
    </div>
  );
}
