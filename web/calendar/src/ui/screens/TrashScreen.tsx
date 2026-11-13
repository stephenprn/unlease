/**
 * The bin, as every app's (Carnet's pattern, the phone's too): one's own events deleted this last
 * week, each with when it went there, « Restaurer » (with « Annuler ») and « Supprimer
 * définitivement » (asked first); « Vider la corbeille » at its head, asked first.
 */
import { useMemo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS, type CalendarEvent } from '@unlease/calendar/models/events';
import { deletedForGoodWords, weekdayDay } from '@unlease/calendar/services/eventText';

import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Confirm } from '@shared/ui/components/Dialog';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { IconButton } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { navigate } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import { binnedEvents, deleteEventForGood, emptyBin, restore } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { paths } from '../routes';

export function TrashScreen() {
  const events = useCalendarStore(s => s.events);
  const now = useMinute();
  const [emptying, setEmptying] = useState(false);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const binned = useMemo(() => binnedEvents(), [events]);
  const list = useRef<HTMLUListElement>(null);
  // An event restored or deleted fades where it was, the others close ranks; one put back by « Annuler » settles in.
  useListMotion(list, { late: true });
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Bin')} action={binned.length > 0 ? { label: t('Empty the bin'), icon: 'broom', onClick: () => setEmptying(true) } : undefined} />
      {binned.length === 0 ? (
        <EmptyState scene="trash" title={t('The bin is empty')} text={t('Deleted events stay there for {days} days, in case you change your mind.', { days: TRASH_RETENTION_DAYS })} />
      ) : (
        <>
          <p className={`${styles.lead} t-meta`}>{t('Events in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}</p>
          <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
            <ul ref={list} className={styles.list}>
              {binned.map(event => {
                const title = event.title.trim() || t('Untitled');
                return (
                  <li key={event.id} className={styles.simpleRow} data-motion={event.id}>
                    <span className={styles.rowText}>
                      <span className="t-body-strong">{title}</span>
                      <span className="t-meta">
                        {weekdayDay(event.start.slice(0, 10))} · {t('Moved to the bin {when}', { when: formatRelative(event.trashedAt ?? now, now) })}
                      </span>
                    </span>
                    <span className={styles.rowTools}>
                      <Button kind="tonal" icon="restore" small onClick={() => showUndo(t('Event restored'), restore(event), { label: t('See the event'), run: () => navigate(paths.event(event.id)) })}>
                        {t('Restore')}
                      </Button>
                      <IconButton icon="trash" label={t('Delete {name} forever', { name: title })} compact onClick={() => setDeleting(event)} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </OutlinedBox>
        </>
      )}
      <Confirm
        open={deleting !== null}
        title={t('Delete forever?')}
        message={t('The event will leave all your devices.')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteEventForGood(deleting);
          setDeleting(null);
          showSnack(t('Event deleted forever'), undefined, { tone: 'success' });
        }}
      />
      <Confirm
        open={emptying}
        title={t('Empty the bin?')}
        message={t('Every event in the bin will be deleted for good, on all your devices.')}
        confirmLabel={t('Empty')}
        danger
        onCancel={() => setEmptying(false)}
        onConfirm={() => {
          setEmptying(false);
          showSnack(deletedForGoodWords(emptyBin()), undefined, { tone: 'success' });
        }}
      />
    </div>
  );
}
