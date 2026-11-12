/**
 * What other apps hand Agenda, each opened once the first run is done, never written without the
 * person: calendar files shared or opened with it (an invitation's `.ics`, a ticket, Google's export),
 * read then shown on the import wizard's preview to confirm; another app's « Ajouter à l'agenda », the new
 * event's form filled (`handedEvent`); a calendar linked from a website (`webcal://`), the
 * subscriptions' form with its address; words selected elsewhere, quick add with them; « open the
 * calendar at » an instant, the day it falls on.
 */
import { t } from '@unlease/core/i18n';
import { feedAddress } from '@unlease/calendar/services/feeds';
import { deviceZone, instantToDay } from '@unlease/calendar/services/time';
import { showSnack } from '@shared/app/store/uiStore';
import { HANDED, onShare, takePendingShare, type Share } from '@platform/intake';

import { handedEvent, type HandedEvent } from './handedEvent';
import { readCalendarFiles } from './importing';
import { setPendingImport } from './store/importStore';
import { useLibraryStore } from './store/libraryStore';
import { later } from './later';

/** Where what arrives opens. */
export interface Arrivals {
  /** The import screen, the shared file read already (`importStore`). */
  readonly import: () => void;
  /** The new event's form, filled. */
  readonly event: (handed: HandedEvent) => void;
  /** The subscriptions, with this address in their form. */
  readonly subscribe: (url: string) => void;
  /** Quick add, with these words in it. */
  readonly words: (text: string) => void;
  /** The day view of this day. */
  readonly day: (day: string) => void;
}

const handled = new Set<string>();

function readExtras(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

/** What another app handed as text; false for a share that is files. */
function receiveHanded(share: Share, arrivals: Arrivals): boolean {
  switch (share.mimeType) {
    case HANDED.event:
      arrivals.event(handedEvent(readExtras(share.text), { zone: deviceZone(), people: useLibraryStore.getState().people.contacts }));
      return true;
    case HANDED.subscribe: {
      const url = feedAddress(share.text);
      if (url) arrivals.subscribe(url);
      return true;
    }
    case HANDED.words:
      if (share.text.trim()) arrivals.words(share.text.trim());
      return true;
    case HANDED.time: {
      const at = Number(share.text);
      if (Number.isSafeInteger(at)) arrivals.day(instantToDay(at, deviceZone()));
      return true;
    }
    default:
      return false;
  }
}

async function receive(share: Share, arrivals: Arrivals): Promise<void> {
  if (handled.has(share.id)) return;
  if (receiveHanded(share, arrivals)) {
    handled.add(share.id);
    return;
  }
  if (share.files.length === 0) return;
  handled.add(share.id);
  const read = await readCalendarFiles(share.files);
  if (read.status === 'error') showSnack(read.message, undefined, { tone: 'error' });
  else if (read.status === 'empty') showSnack(t('Aucun événement dans ce fichier.'), undefined, { tone: 'warning' });
  else {
    setPendingImport({ files: read.files });
    arrivals.import();
  }
}

/** From the root, once the navigator is ready and the first run done: what opened the app, then what comes while it runs. */
export function listenForShares(arrivals: Arrivals): () => void {
  takePendingShare()
    .then(share => (share ? receive(share, arrivals) : undefined))
    .catch(() => showSnack(t('Fichier illisible'), undefined, { tone: 'error' }));
  return onShare(share => later(receive(share, arrivals)));
}
