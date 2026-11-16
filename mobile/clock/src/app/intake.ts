/**
 * Another app's « set an alarm » (the assistant, a calendar's « wake me », a sleep app): the new
 * alarm's editor, filled with what it handed (`handedDraft`), kept only once the person saves it;
 * set at once when the other app asked for no form and named the hour (`handedSkipsForm`: an
 * assistant's « set an alarm for 7 », which is the person's say already). It waits for the first run
 * to be done.
 */
import type { AlarmDraft } from '@unlease/clock/services/editing';
import { handedDraft, handedSkipsForm } from '@unlease/clock/services/editor';
import { HANDED_ALARM, onShare, takePendingShare, type Share } from '@platform/intake';

import { useClockUiStore } from './store/clockUi';

const handled = new Set<string>();

function readExtras(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

interface Handlers {
  /** The editor, filled. */
  readonly open: (draft: AlarmDraft) => void;
  /** Set at once. */
  readonly set: (draft: AlarmDraft) => void;
}

function receive(share: Share, { open, set }: Handlers): void {
  if (handled.has(share.id) || share.mimeType !== HANDED_ALARM) return;
  handled.add(share.id);
  const extras = readExtras(share.text);
  const draft = handedDraft(extras, useClockUiStore.getState().prefs);
  if (handedSkipsForm(extras)) set(draft);
  else open(draft);
}

/** From the root, once the navigator is ready and the first run done: what opened the app, then what comes while it runs. */
export function listenForAlarms(handlers: Handlers): () => void {
  takePendingShare()
    .then(share => (share ? receive(share, handlers) : undefined))
    .catch(() => undefined);
  return onShare(share => receive(share, handlers));
}
