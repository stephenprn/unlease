/**
 * A phone-sized window: the phone's bottom bar, carrying capture (a checklist, a photo note, a link)
 * and the matcha pebble for a text note. It is where the phone shows it (the notes, Rappels, a
 * label), and on the pages' home, where the pebble makes a page. It steps aside while notes are
 * picked: it slides down out of the way and back up after.
 * Coming with its page, it arrives with the page instead (the same shift and fade).
 */
import { useRef, useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';

import { useBoardStore } from '../../app/store/board';
import { openCapture } from '../../app/store/ui';
import { newChecklist, newDrawing, newNote, newPhotoNote } from '../commands';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { usePresence } from '../components/presence';
import { openNewPage } from '../features/pages/PageTree';
import type { Arrival, Route } from '../router';
import styles from './shell.module.css';

/** Its slide away (`--duration-short`), and a little longer for the fallback that lets it go. */
const BAR_EXIT_MS = 200;

/** The board views the phone gives its capture bar (its `showCapture`). */
function showsCapture(route: Route): boolean {
  return route.name === 'board' && (route.view === 'notes' || route.view === 'reminders' || route.view.startsWith('label:'));
}

/** The pages' home has the same bar, its pebble making a page. */
const showsBar = (route: Route): boolean => showsCapture(route) || route.name === 'pages';

/** Mounted with its page (keyed by it): `enter` is how that page came. */
export function BottomBar({ route, enter = null }: { route: Route; enter?: Arrival | null }) {
  const input = useRef<HTMLInputElement>(null);
  // While notes are picked the actions are the selection's, as on the phone.
  const selecting = useBoardStore(s => s.selection.size > 0);
  const { present, closing, done } = usePresence(showsBar(route) && !selecting, BAR_EXIT_MS);
  // It comes with its page once; back after a selection, it rises on its own.
  const [arrival, setArrival] = useState(enter);
  if (arrival && !present) setArrival(null);
  if (!present) return null;
  const pages = route.name === 'pages';
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${styles.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      {pages ? (
        <div className={styles.bottomActions} />
      ) : (
        <div className={styles.bottomActions}>
          <IconButton icon="checklist" label={t('Nouvelle liste')} size={26} onClick={newChecklist} />
          <IconButton icon="draw" label={t('Nouveau dessin')} size={26} shape={3} onClick={newDrawing} />
          <IconButton icon="image" label={t('Nouvelle note avec photo')} size={26} shape={1} onClick={() => input.current?.click()} />
          <IconButton icon="link" label={t('Classer un lien')} size={26} shape={2} onClick={() => openCapture('')} />
        </div>
      )}
      <button type="button" className={styles.fab} data-pebble-under={0} aria-label={pages ? t('Nouvelle page') : t('Nouvelle note')} onClick={pages ? () => openNewPage(null) : newNote}>
        <Icon name="plus" size={26} />
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) void newPhotoNote(files);
        }}
      />
    </div>
  );
}
