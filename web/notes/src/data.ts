/**
 * Carnet's records as a web app holds them: its own, and Pages' (which shows its notes, collections
 * and links, syncs their records and keeps them as Carnet does). Its state, what this browser
 * remembers of it, what every device seeds (« Non classé »), its photos waiting to be sent, and the
 * addresses of its places, in Carnet's own web app.
 */
import { installMentionNamer } from './app/mentions';
import { ensureInbox, markAttachmentUploaded } from './app/store/actions';
import { resetBoard } from './app/store/board';
import { loadLineViews, resetLineViews } from './app/store/lineViews';
import { notesProjection, useLibraryStore } from './app/store/library';
import { resetNotesUi } from './app/store/notesUi';
import { followServer, loadPrefs, resetPrefs } from './app/store/prefs';
import type { AppData } from '@shared/modules';
import { paths } from './ui/routes';

export const notesData: AppData = {
  id: 'notes',
  projection: notesProjection,
  load: () => {
    loadPrefs();
    loadLineViews();
    followServer();
    installMentionNamer();
  },
  boot: ensureInbox,
  reset: () => {
    resetNotesUi();
    resetBoard();
    resetPrefs();
    resetLineViews();
  },
  fileOwner: id => {
    const attachment = useLibraryStore.getState().attachments[id];
    if (!attachment) return null;
    return { done: attachment.deletedAt !== null || attachment.uploaded, mime: attachment.mime, image: true, mark: () => markAttachmentUploaded(id) };
  },
  refPaths: { note: paths.note, line: paths.line, link: paths.link },
};
