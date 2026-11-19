/**
 * An empty view says what goes there and how to put something in it, under a
 * small collage (the phone's EmptyBoard), its copy adjusted for a keyboard and
 * a mouse when the window is wide.
 */
import { memo } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import type { CollageScene } from '@unlease/design/collage';
import { t, tx } from '@unlease/core/i18n';

import type { BoardFilter } from '@unlease/notes/services/boardFilter';

import type { BoardView } from '../../../app/hooks/useBoard';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { NARROW, useMedia } from '@shared/ui/useMedia';

type Kind = 'notes' | 'reminders' | 'archive' | 'trash' | 'protected' | 'label';

const COPY: Record<Kind, { title: string; body: string }> = {
  notes: {
    title: tx('The board is empty'),
    body: tx('Write a note with the bar at the top, or press C. For a link, paste it anywhere on the board: {app} keeps it and, with Claude, files it in the right collection.'),
  },
  reminders: {
    title: tx('No reminders'),
    body: tx('A note created here asks you straight away when to remind you. Your phone will ring at that time.'),
  },
  archive: { title: tx('Nothing in the archive'), body: tx('Archive a note to take it off the board without deleting it.') },
  trash: {
    title: tx('The bin is empty'),
    body: tx('Deleted notes stay here for {days} days, in case you change your mind.'),
  },
  label: { title: tx('No notes with this label'), body: tx('Add this label to a note from the editor, or create one here.') },
  protected: { title: tx('No protected notes'), body: tx('Protect a note from its menu: it then shows only here, behind the password.') },
};

/** On a phone the capture buttons are at the bottom and there is no keyboard: the phone's words. */
const NARROW_COPY: Partial<Record<Kind, { title: string; body: string }>> = {
  notes: {
    title: tx('The board is empty'),
    body: tx('Write a note or a list with the bar at the bottom. For a link, tap the link at the bottom: {app} keeps it and, with Claude, files it in the right collection.'),
  },
  reminders: { title: tx('No reminders'), body: tx('The + button, at the bottom, creates a note and asks you when to remind you.') },
};

/** A filter that keeps nothing of a board that holds notes: what it would show, and the way back to all of them (the phone's). */
const FILTER_COPY: Record<Exclude<BoardFilter, 'all'>, { title: string; body: string; scene: CollageScene }> = {
  week: { title: tx('Nothing written this week'), body: tx('The notes and lists you write or change show here for seven days.'), scene: 'notes' },
  todo: { title: tx('Nothing left to do'), body: tx('Lists with items left to tick, and notes with a reminder coming up or missed this week, show here.'), scene: 'reminders' },
  lists: { title: tx('No lists'), body: tx('The lists you make show here.'), scene: 'notes' },
};

const SCENE: Record<Kind, CollageScene> = { notes: 'notes', reminders: 'reminders', archive: 'archive', trash: 'trash', protected: 'archive', label: 'label' };

/** Under a keyboard, the keys that fill the board. */
const NOTE_KEYS = [
  { key: 'C', label: tx('note') },
  { key: 'L', label: tx('list') },
  { key: 'V', label: tx('paste a link') },
  { key: '?', label: tx('shortcuts') },
] as const;

/** `filter`: the notes' filter, when it keeps nothing of notes there are. */
function EmptyBoardComponent({ view, filter = 'all', onShowAll }: { view: BoardView; filter?: BoardFilter; onShowAll?: () => void }) {
  const narrow = useMedia(NARROW);
  if (filter !== 'all') {
    const copy = FILTER_COPY[filter];
    return (
      <EmptyState scene={copy.scene} title={t(copy.title)} text={t(copy.body)}>
        <Button kind="tonal" onClick={onShowAll}>
          {t('Show all notes')}
        </Button>
      </EmptyState>
    );
  }
  const kind: Kind = view.startsWith('label:') ? 'label' : (view as Kind);
  const copy = (narrow ? NARROW_COPY[kind] : undefined) ?? COPY[kind];
  return <EmptyState scene={SCENE[kind]} title={t(copy.title)} text={t(copy.body, { app: APP_NAME, days: TRASH_RETENTION_DAYS })} keys={view === 'notes' && !narrow ? NOTE_KEYS.map(item => ({ ...item, label: t(item.label) })) : undefined} />;
}

export const EmptyBoard = memo(EmptyBoardComponent);
