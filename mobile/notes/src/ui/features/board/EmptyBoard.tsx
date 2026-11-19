/** An empty view says what goes there and how to put something in it, under a small collage (the suite's `EmptyState`). */
import React, { memo } from 'react';
import type { RefreshControlProps } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import type { CollageScene } from '@unlease/design/collage';
import { t, tx } from '@unlease/core/i18n';
import type { BoardFilter } from '@unlease/notes/services/boardFilter';
import type { BoardView } from '@app/hooks/useBoard';

import { Button, EdgeScrollView, EmptyState } from '../../components';

type Kind = 'notes' | 'reminders' | 'archive' | 'trash' | 'protected' | 'label';

const COPY: Record<Kind, { title: string; body: string }> = {
  notes: {
    title: tx('The board is empty'),
    body: tx('The + button, at the bottom, makes a note, a list or a drawing. For a link, share it from any app: {app} keeps it and, with Claude, files it in the right collection.'),
  },
  reminders: { title: tx('No reminders'), body: tx('The + button, at the bottom, creates a note and asks you when to remind you.') },
  archive: { title: tx('Nothing in the archive'), body: tx('Archive a note to take it off the board without deleting it.') },
  trash: { title: tx('The bin is empty'), body: tx('Deleted notes stay here for {days} days, in case you change your mind.') },
  protected: { title: tx('No protected notes'), body: tx('Protect a note from its menu: it then shows only here, behind the password.') },
  label: { title: tx('No notes with this label'), body: tx('Add this label to a note from its tag, at the bottom of the note, or create one here.') },
};

/** A filter that keeps nothing of a board that holds notes: what it would show, and the way back to all of them. */
const FILTER_COPY: Record<Exclude<BoardFilter, 'all'>, { title: string; body: string; scene: CollageScene }> = {
  week: { title: tx('Nothing written this week'), body: tx('The notes and lists you write or change show here for seven days.'), scene: 'notes' },
  todo: { title: tx('Nothing left to do'), body: tx('Lists with items left to tick, and notes with a reminder coming up or missed this week, show here.'), scene: 'reminders' },
  lists: { title: tx('No lists'), body: tx('The lists you make show here.'), scene: 'notes' },
};

const SCENE: Record<Kind, CollageScene> = { notes: 'notes', reminders: 'reminders', archive: 'archive', trash: 'trash', protected: 'archive', label: 'label' };

/** `refreshControl`: the wall's pull to sync (`usePullToSync`), here too. */
function EmptyBoardComponent({
  view,
  filter = 'all',
  onShowAll,
  header,
  bottomSpace,
  refreshControl,
}: {
  view: BoardView;
  /** The notes' filter, when it keeps nothing of notes there are. */
  filter?: BoardFilter;
  onShowAll?: () => void;
  header?: React.ReactNode;
  bottomSpace: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const kind: Kind = view.startsWith('label:') ? 'label' : (view as Kind);
  const copy = COPY[kind];
  const narrowed = filter === 'all' ? null : FILTER_COPY[filter];
  return (
    <EdgeScrollView
      contentContainerStyle={{ paddingBottom: bottomSpace + 24 }}
      refreshControl={refreshControl}
    >
      {header}
      {narrowed ? (
        <EmptyState scene={narrowed.scene} title={t(narrowed.title)} text={t(narrowed.body)}>
          <Button kind="tonal" label={t('Show all notes')} onPress={() => onShowAll?.()} />
        </EmptyState>
      ) : (
        <EmptyState scene={SCENE[kind]} title={t(copy.title)} text={t(copy.body, { app: APP_NAME, days: TRASH_RETENTION_DAYS })} />
      )}
    </EdgeScrollView>
  );
}

export const EmptyBoard = memo(EmptyBoardComponent);
