/**
 * Contact cards shared to the app (WhatsApp's « Partager le contact », a `.vcf` opened from a file
 * manager): read, then shown on the import's preview to confirm, never written without asking. Another
 * app's « Créer un contact » (the dialer's, Messages'): the new contact's form, filled with what it
 * handed (`handedContact`), saved or left by the person. Both wait for the first run to be done.
 */
import { t } from '@unlease/core/i18n';
import { showSnack } from '@shared/app/store/uiStore';
import { HANDED_CONTACT, onShare, takePendingShare, type Share } from '@platform/intake';

import { handedContact, type HandedContact } from './handedContact';
import { readSharedFiles } from './importing';
import { setPendingImport } from './store/importStore';
import { later } from './later';

/** Where what arrives opens. */
export interface Arrivals {
  /** The import screen, the shared card read already (`importStore`). */
  readonly import: () => void;
  /** The new contact's form, filled. */
  readonly create: (handed: HandedContact) => void;
}

const handled = new Set<string>();

function readExtras(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function receive(share: Share, arrivals: Arrivals): Promise<void> {
  if (handled.has(share.id)) return;
  if (share.mimeType === HANDED_CONTACT) {
    handled.add(share.id);
    arrivals.create(handedContact(readExtras(share.text)));
    return;
  }
  if (share.files.length === 0) return;
  handled.add(share.id);
  const read = await readSharedFiles(share.files, share.subject);
  if (read.status !== 'ok') {
    if (read.status === 'error') showSnack(read.message, undefined, { tone: 'error' });
    return;
  }
  setPendingImport(read.read);
  arrivals.import();
}

/** From the root, once the navigator is ready and the first run done: what opened the app, then what comes while it runs. */
export function listenForShares(arrivals: Arrivals): () => void {
  takePendingShare()
    .then(share => (share ? receive(share, arrivals) : undefined))
    .catch(() => showSnack(t('Fichier illisible'), undefined, { tone: 'error' }));
  return onShare(share => later(receive(share, arrivals)));
}
