/** True when a key or a paste belongs to a text field rather than to the app. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/** An Apple keyboard, where a shortcut is held with ⌘ instead of Ctrl. */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The key a shortcut is held with, as this keyboard names it. */
export function modKey(): string {
  return isApple() ? '⌘' : 'Ctrl';
}

/** Puts `text` on the clipboard from a click; false when the browser refuses. Over plain http (a LAN server) there is no clipboard API, so a hidden field is copied instead. */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (no focus, no permission): the older way may still work.
    }
  }
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  field.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
  }
}

/** Bytes the app made, handed to the browser as a download named `name`. */
export function saveFile(bytes: Uint8Array, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the browser to have read it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
