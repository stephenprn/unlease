/**
 * Shares and the clipboard via the Intake TurboModule. A missing module (JS reloaded
 * against an older native build) reads as "nothing was shared", never a crash.
 */
import NativeIntake, { type SharedPayload } from '../../specs/NativeIntake';

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

export async function readClipboard(): Promise<string> {
  if (!NativeIntake) return '';
  try {
    return await NativeIntake.readClipboardText();
  } catch {
    return '';
  }
}

/** False when it could not be copied (refused, or a native build without the call). */
export async function copyText(text: string): Promise<boolean> {
  if (!NativeIntake?.writeClipboardText) return false;
  try {
    return await NativeIntake.writeClipboardText(text);
  } catch {
    return false;
  }
}
