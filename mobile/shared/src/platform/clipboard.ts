/**
 * The clipboard, through the suite's Clipboard TurboModule. A missing module (JS reloaded against an
 * older native build) reads as an empty clipboard, and says it could not copy, never a crash.
 */
// eslint-disable-next-line no-restricted-syntax -- a file's name (the spec's, which codegen names the native class after).
import NativeClipboard from '../../specs/NativeUnleaseClipboard';

export async function readClipboard(): Promise<string> {
  if (!NativeClipboard) return '';
  try {
    return await NativeClipboard.readText();
  } catch {
    return '';
  }
}

/** False when it could not be copied (refused, or a native build without the module). */
export async function copyText(text: string): Promise<boolean> {
  if (!NativeClipboard) return false;
  try {
    return await NativeClipboard.writeText(text);
  } catch {
    return false;
  }
}
