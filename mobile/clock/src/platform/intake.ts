/**
 * What Android hands Clock (its side of the Intake TurboModule): another app's « set an alarm »
 * (`AlarmClock.ACTION_SET_ALARM`: the assistant, a calendar, a sleep app), parked by `IntakeModule`
 * with its extras as JSON. A missing module reads as « nothing was handed », never a crash.
 */
import NativeIntake, { type SharedPayload } from '../../../shared/specs/NativeIntake';

export type Share = SharedPayload;

/** A share's `mimeType` when it is another app's « set an alarm »: `{ hour, minutes, days, message, vibrate }` in `text` (IntakeModule.SET_ALARM). */
export const HANDED_ALARM = 'x-unlease/alarm-set';

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
