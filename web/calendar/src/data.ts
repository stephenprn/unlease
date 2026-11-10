/**
 * Agenda's records as a web app holds them: its own, and those of an app that shows events
 * (Carnet's and Pages' mentions), which syncs their records and keeps them as Agenda does. Its
 * state, what this browser remembers of it, the files of its events waiting to be sent, and the
 * address of an event in Agenda's own web app. A leaf: it pulls in none of Agenda's screens.
 */
import type { AppData } from '@shared/modules';
import { eventsWithFile, markFileUploaded } from './app/store/actions';
import { resetCalendarUi } from './app/store/calendarUi';
import { calendarProjection } from './app/store/library';
import { loadPrefs, resetPrefs } from './app/store/prefs';

const isImage = (mime: string): boolean => /^image\/(jpeg|png|webp|gif|heic|heif|avif)$/.test(mime);

export const calendarData: AppData = {
  id: 'calendar',
  projection: calendarProjection,
  load: loadPrefs,
  reset: () => {
    resetPrefs();
    resetCalendarUi();
  },
  // A file joined here, kept in this browser until the server has it (a copy of an event shares it).
  fileOwner: id => {
    const owners = eventsWithFile(id);
    if (owners.length === 0) return null;
    const waiting = owners.find(event => event.deletedAt === null && event.files.some(file => file.id === id && !file.uploaded));
    const file = (waiting ?? owners[0]!).files.find(each => each.id === id)!;
    return { done: !waiting, mime: file.mime || 'application/octet-stream', image: isImage(file.mime), mark: () => markFileUploaded(id) };
  },
  refPaths: { event: id => `/agenda/event/${encodeURIComponent(id)}` },
};
