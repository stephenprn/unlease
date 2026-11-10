/**
 * Contact cards shared to the app (WhatsApp's « Partager le contact », a `.vcf` opened from a file
 * manager): read, then shown on the import screen to confirm, never written without asking.
 */
import { t } from '@unlease/core/i18n';
import { showSnack } from '@shared/app/store/uiStore';
import { onShare, takePendingShare, type Share } from '@platform/intake';

import { readSharedFiles } from './importing';
import { setPendingImport } from './store/importStore';
import { later } from './later';

const handled = new Set<string>();

async function receive(share: Share, open: () => void): Promise<void> {
  if (handled.has(share.id) || share.files.length === 0) return;
  handled.add(share.id);
  const read = await readSharedFiles(share.files);
  if (read.status !== 'ok') {
    if (read.status === 'error') showSnack(read.message, undefined, { tone: 'error' });
    return;
  }
  setPendingImport({ source: 'shared', contacts: read.contacts, name: share.subject });
  open();
}

/** From the root, once the navigator is ready: the card that opened the app, then those that come while it runs; `open` shows the import screen. */
export function listenForShares(open: () => void): () => void {
  takePendingShare()
    .then(share => (share ? receive(share, open) : undefined))
    .catch(() => showSnack(t('Fichier illisible'), undefined, { tone: 'error' }));
  return onShare(share => later(receive(share, open)));
}
