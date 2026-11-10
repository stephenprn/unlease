/**
 * Calendar files shared to the app or opened with it (an invitation's `.ics`, a ticket, Google's
 * export): read, then shown on the import screen to confirm, never written without asking.
 */
import { t } from '@unlease/core/i18n';
import { showSnack } from '@shared/app/store/uiStore';
import { onShare, takePendingShare, type Share } from '@platform/intake';

import { readCalendarFiles } from './importing';
import { setPendingImport } from './store/importStore';
import { later } from './later';

const handled = new Set<string>();

async function receive(share: Share, open: () => void): Promise<void> {
  if (handled.has(share.id) || share.files.length === 0) return;
  handled.add(share.id);
  const read = await readCalendarFiles(share.files);
  if (read.status === 'error') showSnack(read.message, undefined, { tone: 'error' });
  else if (read.status === 'empty') showSnack(t('Aucun événement dans ce fichier.'), undefined, { tone: 'warning' });
  else {
    setPendingImport({ calendar: read.calendar, name: share.subject });
    open();
  }
}

/** From the root, once the navigator is ready: the file that opened the app, then those that come while it runs. */
export function listenForShares(open: () => void): () => void {
  takePendingShare()
    .then(share => (share ? receive(share, open) : undefined))
    .catch(() => showSnack(t('Fichier illisible'), undefined, { tone: 'error' }));
  return onShare(share => later(receive(share, open)));
}
