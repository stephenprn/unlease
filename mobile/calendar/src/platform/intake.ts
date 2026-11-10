/**
 * Calendar files shared to the app (Agenda's side of the Intake TurboModule: `.ics` files copied into
 * the cache). A missing module reads as « nothing was shared », never a crash.
 */
import NativeIntake, { type SharedPayload } from '../../../shared/specs/NativeIntake';

export type Share = SharedPayload;

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
