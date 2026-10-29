/**
 * The cook mode's timers wherever the person is: they tick here, ring once when done (a chime and a
 * slip), and stay until dismissed. Each rings from its own timeout: a hidden tab slows a repeating
 * tick to a minute, not a single wait. Mounted once in the app's shell; the cook mode shows the same
 * pills in its own head.
 */
import { useEffect, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { formatCountdown } from '@unlease/notes/services/recipes';

import { selectTimers, stopTimer, useKitchenStore, type KitchenTimer } from '../../../app/store/kitchen';
import { useLibraryStore } from '../../../app/store/library';
import { showWarning } from '../../../app/store/ui';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { chime, useSecond } from './kitchen';
import styles from './links.module.css';

/**
 * One timer: what it times and the time left, or « Terminé » once it rang; its button stops or
 * dismisses it. `here`: the recipe on screen; a timer started for another names its recipe (the phone's).
 */
export function TimerPill({ timer, now, here }: { timer: KitchenTimer; now: number; here?: string }) {
  const recipe = useLibraryStore(s => (timer.linkId !== here ? (s.links[timer.linkId]?.title.trim() ?? '') : ''));
  const left = (timer.endsAt - now) / 1000;
  const done = left <= 0;
  return (
    <li className={styles.timerPill} data-done={done || undefined}>
      <Icon name="clock" size={18} />
      <span className={styles.timerWhat}>
        <span className="t-label">{timer.label}</span>
        {recipe ? <span className={`${styles.timerRecipe} t-meta`}>{recipe}</span> : null}
      </span>
      <span className="t-label tabular" role={done ? 'status' : undefined}>
        {done ? t('Terminé') : formatCountdown(left)}
      </span>
      <IconButton icon="close" compact onSlip={!done} label={done ? t('Fermer le minuteur') : t('Arrêter le minuteur')} onClick={() => stopTimer(timer.id)} />
    </li>
  );
}

export function KitchenTimers() {
  const timers = useKitchenStore(selectTimers);
  const now = useSecond(timers.length > 0);
  const rung = useRef(new Set<string>());
  useEffect(() => {
    const ring = (timer: KitchenTimer): void => {
      if (rung.current.has(timer.id)) return;
      rung.current.add(timer.id);
      chime();
      showWarning(t('Minuteur terminé : {label}', { label: timer.label }));
    };
    const waits = timers.filter(timer => !rung.current.has(timer.id)).map(timer => setTimeout(() => ring(timer), Math.max(0, timer.endsAt - Date.now())));
    return () => waits.forEach(clearTimeout);
  }, [timers]);
  if (timers.length === 0) return null;
  return (
    <ul className={styles.timerTray} aria-label={t('Minuteurs')}>
      {timers.map(timer => (
        <TimerPill key={timer.id} timer={timer} now={now} />
      ))}
    </ul>
  );
}
