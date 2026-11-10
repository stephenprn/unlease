/**
 * The bin, as every app's (Carnet's pattern, the phone's too): one's own events deleted this last
 * week, each with when it went there, « Restaurer » (with « Annuler ») and « Supprimer
 * définitivement » (asked first); « Vider la corbeille » at its head, asked first.
 */
import { useMemo, useState } from 'react';

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
import { binnedEvents, deleteEventForGood, emptyBin, restore } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';

export function TrashScreen() {
  const events = useCalendarStore(s => s.events);
  const now = useMinute();
  const [emptying, setEmptying] = useState(false);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const binned = useMemo(() => binnedEvents(), [events]);
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Corbeille')} action={binned.length > 0 ? { label: t('Vider la corbeille'), icon: 'broom', onClick: () => setEmptying(true) } : undefined} />
      {binned.length === 0 ? (
        <EmptyState scene="trash" title={t('La corbeille est vide')} text={t('Les événements supprimés y restent {days} jours, le temps de changer d’avis.', { days: TRASH_RETENTION_DAYS })} />
      ) : (
        <>
          <p className={`${styles.lead} t-meta`}>{t('Les événements de la corbeille sont supprimés au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}</p>
          <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
            <ul className={styles.list}>
              {binned.map(event => {
                const title = event.title.trim() || t('Sans titre');
                return (
                  <li key={event.id} className={styles.simpleRow}>
                    <span className={styles.rowText}>
                      <span className="t-body-strong">{title}</span>
                      <span className="t-meta">
                        {weekdayDay(event.start.slice(0, 10))} · {t('Mis à la corbeille {when}', { when: formatRelative(event.trashedAt ?? now, now) })}
                      </span>
                    </span>
                    <span className={styles.rowTools}>
                      <Button kind="tonal" icon="restore" small onClick={() => showUndo(t('Événement restauré'), restore(event))}>
                        {t('Restaurer')}
                      </Button>
                      <IconButton icon="trash" label={t('Supprimer définitivement {name}', { name: title })} compact onClick={() => setDeleting(event)} />
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
        title={t('Supprimer définitivement ?')}
        message={t('L’événement disparaîtra de tous vos appareils.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteEventForGood(deleting);
          setDeleting(null);
          showSnack(t('Événement supprimé définitivement'), undefined, { tone: 'success' });
        }}
      />
      <Confirm
        open={emptying}
        title={t('Vider la corbeille ?')}
        message={t('Tous les événements de la corbeille seront supprimés définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
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
