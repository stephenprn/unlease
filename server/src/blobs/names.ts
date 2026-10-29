/**
 * Readable names for files, the same in the drive (Seafile) and in a backup archive: made safe for
 * every file system and unique among their siblings. Each app lays its own files out with them
 * (Carnet's: `apps/notes/files.ts`).
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export const extensionFor = (mime: string): string => EXTENSIONS[mime] ?? 'bin';

/** A name every file system takes: no separators or reserved characters, no leading dot, 80 characters at most. */
export function safeName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const clipped = [...cleaned].slice(0, 80).join('').replace(/[. ]+$/, '').trim();
  return clipped || fallback;
}

/** `name`, or `name (2)`, `name (3)`... before the extension, unique in `taken` whatever the case. */
export function uniqueName(name: string, taken: Set<string>, extension = ''): string {
  const suffix = extension ? `.${extension}` : '';
  let candidate = `${name}${suffix}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${name} (${n})${suffix}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

const pad = (value: number): string => String(value).padStart(2, '0');
/** "2026-10-26 14.03.12", in the server's time zone (`TZ`). */
export function stamp(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}
