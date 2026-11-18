/**
 * Carnet's protected section (`core/services/lock`): a note there (`locked`) shows nowhere else, not
 * on the board, in the archive, a label, the reminders, the collections, search, the widgets, the
 * share sheet, another app or the server's own lists; in the section and the bin only once the lock
 * is open. A note is opened by its id there and nowhere else (a link, a notification) only open too.
 */
import type { Note } from '../models/entities';

export const isLockedNote = (note: Pick<Note, 'locked'> | undefined): boolean => note?.locked === true;

/** Whether a note may show outside the protected section: every list but the section's and the bin's. */
export const shownOutsideLock = (note: Pick<Note, 'locked'> | undefined): boolean => !isLockedNote(note);

/** Whether a note may show at all now: outside the section, or with the lock open. */
export const shownNow = (note: Pick<Note, 'locked'> | undefined, open: boolean): boolean => open || !isLockedNote(note);
