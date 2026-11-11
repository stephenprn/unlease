/**
 * Calendar files shared to the app (Agenda's side of the Intake TurboModule: `.ics` files copied into
 * the cache), and the other ways other apps reach it, handed as text. A missing module reads as
 * « nothing was shared », never a crash.
 */
import NativeIntake, { type SharedPayload } from '../../../shared/specs/NativeIntake';

export type Share = SharedPayload;

/** A share's `mimeType` when it is no file, what it holds in `text` (IntakeModule's INSERT, SUBSCRIBE, WORDS, TIME). */
export const HANDED = {
  /** Another app's « Ajouter à l'agenda »: its extras (CalendarContract's), as JSON. */
  event: 'x-unlease/event-insert',
  /** A calendar's address to subscribe to, as a website linked it (`webcal://…`). */
  subscribe: 'x-unlease/subscribe',
  /** Words selected in another app (« Créer un événement »), for quick add. */
  words: 'x-unlease/words',
  /** An instant to open the calendar at (« open the calendar at »), in epoch ms. */
  time: 'x-unlease/time',
} as const;

export async function takePendingShare(): Promise<Share | null> {
  if (!NativeIntake) return null;
  try {
    const share = await NativeIntake.takePendingShare();
    return share.id ? share : null;
  } catch {
    return null;
  }
}

export function onShare(listener: (share: Share) => void): () => void {
  if (!NativeIntake) return () => {};
  const subscription = NativeIntake.onShare(share => {
    if (share.id) listener(share);
  });
  return () => subscription.remove();
}
