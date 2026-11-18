/**
 * A protected note (`notes/services/lock`) reached by its address while the lock is shut (a link, a
 * back button, the history): the lock in a dialog over the page, in place of the note. Opened, the
 * note's own editor or link panel takes its place.
 */
import { useId } from 'react';

import { t } from '@unlease/core/i18n';
import { isLockedNote } from '@unlease/notes/services/lock';

import { useLockOpen } from '@shared/app/lock';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Layer } from '@shared/ui/components/Layer';
import { LockedPlace, LockPanel } from '@shared/ui/features/lock/LockedPlace';

import { useLibraryStore } from '../../../app/store/library';
import board from '../board/board.module.css';

/** Whether a note (or a link's collection) is behind the lock now: protected, and the lock shut. */
export function useShutNote(noteId: string | null | undefined): boolean {
  const locked = useLibraryStore(state => (noteId ? isLockedNote(state.notes[noteId]) : false));
  const open = useLockOpen();
  return locked && !open;
}

export function ProtectedNote({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <Layer open={!closing} onDismiss={onClose} labelledBy={titleId} routed>
      <DialogFrame title={t('Locked')} titleId={titleId} onClose={onClose}>
        <LockPanel bare what={t('This note is protected: it opens with the password.')} />
      </DialogFrame>
    </Layer>
  );
}

/** A protected collection opened by its address while the lock is shut: the lock over its shapes, in its page's place. */
export function ProtectedPage({ what }: { what: string }) {
  return (
    <div className={board.board}>
      <h1 className="sr-only">{t('Locked')}</h1>
      <LockedPlace ghosts="notes" what={what} />
    </div>
  );
}
