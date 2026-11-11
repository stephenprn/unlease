/**
 * Contact cards shared to the app (Contacts' side of the Intake TurboModule: `.vcf` files copied into
 * the cache), and another app's « Créer un contact ». A missing module reads as « nothing was
 * shared », never a crash.
 */
import NativeIntake, { type SharedPayload } from '../../../shared/specs/NativeIntake';

export type Share = SharedPayload;

/** A share's `mimeType` when it is another app's new contact (Android's INSERT): its extras as JSON in `text` (IntakeModule.INSERT). */
export const HANDED_CONTACT = 'x-unlease/contact-insert';

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
