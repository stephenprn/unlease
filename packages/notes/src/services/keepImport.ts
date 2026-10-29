/**
 * Google Keep, from a Takeout export (one JSON file per note), into records.
 * The format is undocumented: an unreadable file is counted and skipped, never fatal.
 * Clocks carry each note's Keep edit time, so a later real edit on any device wins.
 */
import { getLocale } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { INBOX_ID, type NoteKind } from '../models/entities';
import { formatHlc } from '@unlease/core/sync/hlc';
import { checkFields, labelFields, linkFields, noteFields } from '../sync/entities';
import type { SyncRecord } from '@unlease/core/sync/record';
import { createId } from '@unlease/core/services/ids';
import { keyBetween, keysBetween, positionsBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import { extractUrls, normalizeUrl } from '@unlease/core/services/url';

const KEEP_COLORS: Record<string, LineColor | null> = {
  DEFAULT: null,
  WHITE: null,
  RED: 'red',
  ORANGE: 'orange',
  YELLOW: 'yellow',
  GREEN: 'green',
  TEAL: 'sky',
  BLUE: 'blue',
  CERULEAN: 'violet',
  DARK_BLUE: 'violet',
  PURPLE: 'lilac',
  PINK: 'pink',
  BROWN: 'brown',
  GRAY: 'grey',
  GREY: 'grey',
};

export interface ImportedNote {
  readonly source: string;
  readonly kind: Exclude<NoteKind, 'links'>;
  readonly title: string;
  readonly body: string;
  readonly color: LineColor | null;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly labelNames: readonly string[];
  readonly createdAt: number;
  readonly editedAt: number;
  readonly checks: readonly { readonly text: string; readonly checked: boolean }[];
  readonly attachments: readonly { readonly filePath: string; readonly mime: string }[];
  /** Set when the note is just a link: it can become a link item instead. */
  readonly onlyUrl: string | null;
}

export interface KeepPlan {
  readonly notes: readonly ImportedNote[];
  readonly labelNames: readonly string[];
  readonly trashed: number;
  readonly unreadable: readonly string[];
}

interface KeepJson {
  color?: unknown;
  isTrashed?: unknown;
  isPinned?: unknown;
  isArchived?: unknown;
  textContent?: unknown;
  title?: unknown;
  userEditedTimestampUsec?: unknown;
  createdTimestampUsec?: unknown;
  labels?: unknown;
  listContent?: unknown;
  attachments?: unknown;
}

const usecToMs = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value / 1000) : null;

/** Null when unreadable or empty; 'trashed' for notes from Keep's bin. */
export function parseKeepNote(source: string, text: string): ImportedNote | 'trashed' | null {
  let raw: KeepJson;
  try {
    raw = JSON.parse(text) as KeepJson;
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  if (raw.isTrashed === true) return 'trashed';

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const body = typeof raw.textContent === 'string' ? raw.textContent.replace(/\s+$/, '') : '';
  const checks = Array.isArray(raw.listContent)
    ? raw.listContent
        .filter((entry): entry is { text: string; isChecked?: unknown } =>
          typeof entry === 'object' && entry !== null && typeof (entry as { text?: unknown }).text === 'string',
        )
        .map(entry => ({ text: entry.text.trim(), checked: entry.isChecked === true }))
        .filter(entry => entry.text.length > 0)
    : [];
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .filter(
          (entry): entry is { filePath: string; mimetype: string } =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { filePath?: unknown }).filePath === 'string' &&
            typeof (entry as { mimetype?: unknown }).mimetype === 'string' &&
            (entry as { mimetype: string }).mimetype.startsWith('image/'),
        )
        .map(entry => ({ filePath: entry.filePath, mime: entry.mimetype }))
    : [];
  const labelNames = Array.isArray(raw.labels)
    ? raw.labels
        .map(entry => (typeof entry === 'object' && entry !== null ? (entry as { name?: unknown }).name : null))
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        .map(name => name.trim())
    : [];

  const kind = checks.length > 0 || Array.isArray(raw.listContent) ? 'checklist' : 'text';
  if (!title && !body && checks.length === 0 && attachments.length === 0) return null;

  const editedAt = usecToMs(raw.userEditedTimestampUsec) ?? usecToMs(raw.createdTimestampUsec) ?? 0;
  const createdAt = usecToMs(raw.createdTimestampUsec) ?? editedAt;

  let onlyUrl: string | null = null;
  if (kind === 'text' && attachments.length === 0) {
    const urls = extractUrls(body);
    if (urls.length === 1 && body.trim() === urls[0]) onlyUrl = normalizeUrl(urls[0]!);
  }

  return {
    source,
    kind,
    title,
    body: kind === 'text' ? body : '',
    color: typeof raw.color === 'string' ? KEEP_COLORS[raw.color] ?? null : null,
    pinned: raw.isPinned === true,
    archived: raw.isArchived === true,
    labelNames,
    createdAt,
    editedAt,
    checks,
    attachments,
    onlyUrl,
  };
}

export function planKeepImport(files: readonly { readonly name: string; readonly text: string }[]): KeepPlan {
  const notes: ImportedNote[] = [];
  const unreadable: string[] = [];
  const labels = new Map<string, string>();
  let trashed = 0;
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.json')) continue;
    const parsed = parseKeepNote(file.name, file.text);
    if (parsed === 'trashed') {
      trashed += 1;
    } else if (parsed === null) {
      // Label files are not notes: never report them as unreadable.
      if (!/labels/i.test(file.name)) unreadable.push(file.name);
    } else {
      notes.push(parsed);
      for (const name of parsed.labelNames) {
        if (!labels.has(foldText(name))) labels.set(foldText(name), name);
      }
    }
  }
  return { notes, labelNames: [...labels.values()], trashed, unreadable };
}

export interface ImportOptions {
  /** The importing device's clock node. */
  readonly node: string;
  readonly now: number;
  /** A Keep label with the same name reuses one of these. */
  readonly existingLabels: readonly { readonly id: string; readonly name: string }[];
  readonly labelColors: readonly LineColor[];
  /** The first note on the board today, so imported notes go before it. */
  readonly firstPosition: string | null;
  /** Turn link-only notes into links in "Non classé" (each one is read by Claude). */
  readonly convertLinks: boolean;
}

export interface ImportResult {
  readonly records: readonly SyncRecord[];
  /** `filePath` is the image's path inside the export. */
  readonly uploads: readonly { readonly attachmentId: string; readonly filePath: string; readonly mime: string }[];
  readonly noteCount: number;
  readonly linkCount: number;
}

export function keepPlanToRecords(plan: KeepPlan, options: ImportOptions): ImportResult {
  const records: SyncRecord[] = [];
  const uploads: { attachmentId: string; filePath: string; mime: string }[] = [];
  let counter = 0;
  /** A clock at a past time, unique within this import. */
  const clockAt = (time: number): string => {
    counter += 1;
    return formatHlc(Math.max(1, Math.min(time, options.now)), counter % 1_000_000, options.node);
  };
  const record = (type: SyncRecord['type'], id: string, fields: Record<string, unknown>, time: number): SyncRecord => {
    const clock = clockAt(time);
    const clocks: Record<string, string> = {};
    for (const key of Object.keys(fields)) clocks[key] = clock;
    return { type, id, fields, clocks };
  };

  const labelIds = new Map<string, string>();
  for (const label of options.existingLabels) labelIds.set(foldText(label.name), label.id);
  const newLabels = plan.labelNames.filter(name => !labelIds.has(foldText(name)));
  const labelKeys = keysBetween(null, null, newLabels.length);
  newLabels.forEach((name, index) => {
    const id = createId(options.now);
    labelIds.set(foldText(name), id);
    records.push(
      record(
        'label',
        id,
        labelFields({
          name: name.slice(0, 60),
          color: options.labelColors[index % Math.max(1, options.labelColors.length)] ?? 'blue',
          position: labelKeys[index]!,
          createdAt: options.now,
          deletedAt: null,
        }),
        options.now,
      ),
    );
  });

  // Newest first, pinned first: Takeout does not keep Keep's manual order.
  const ordered = [...plan.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.editedAt - a.editedAt);
  const asLinks = options.convertLinks ? ordered.filter(note => note.onlyUrl) : [];
  const asNotes = options.convertLinks ? ordered.filter(note => !note.onlyUrl) : ordered;
  const noteKeys = positionsBetween(null, options.firstPosition, asNotes.length);

  asNotes.forEach((note, index) => {
    const id = createId(note.createdAt || options.now);
    records.push(
      record(
        'note',
        id,
        noteFields({
          kind: note.kind,
          title: note.title.slice(0, 1000),
          body: note.body.slice(0, 200_000),
          color: note.color,
          pinned: note.pinned,
          archived: note.archived,
          trashedAt: null,
          labelIds: note.labelNames.map(name => labelIds.get(foldText(name))).filter((v): v is string => !!v),
          position: noteKeys[index]!,
          reminderAt: null,
          code: '',
          hint: '',
          createdAt: note.createdAt,
          deletedAt: null,
        }),
        note.editedAt,
      ),
    );
    let lastCheck: string | null = null;
    for (const check of note.checks) {
      lastCheck = keyBetween(lastCheck, null);
      records.push(
        record(
          'check',
          createId(note.createdAt || options.now),
          checkFields({
            noteId: id,
            text: check.text.slice(0, 5000),
            checked: check.checked,
            position: lastCheck,
            indent: 0,
            createdAt: note.createdAt,
            deletedAt: null,
          }),
          note.editedAt,
        ),
      );
    }
    let lastImage: string | null = null;
    for (const attachment of note.attachments) {
      lastImage = keyBetween(lastImage, null);
      const attachmentId = createId(options.now);
      records.push(
        record(
          'attachment',
          attachmentId,
          {
            noteId: id,
            mime: attachment.mime === 'image/jpg' ? 'image/jpeg' : attachment.mime,
            width: 0,
            height: 0,
            bytes: 0,
            position: lastImage,
            uploaded: false,
            createdAt: note.createdAt,
            deletedAt: null,
          },
          note.editedAt,
        ),
      );
      uploads.push({ attachmentId, filePath: attachment.filePath, mime: attachment.mime });
    }
  });

  let lastLink: string | null = null;
  for (const note of asLinks) {
    lastLink = keyBetween(lastLink, null);
    records.push(
      record(
        'link',
        createId(note.createdAt || options.now),
        linkFields({
          noteId: INBOX_ID,
          url: note.onlyUrl!,
          status: 'pending',
          autoFile: true,
          filedBy: null,
          lang: getLocale(),
          title: note.title.slice(0, 500),
          summary: '',
          siteName: '',
          kind: 'other',
          price: null,
          currency: null,
          attributes: [],
          imageIds: [],
          imageUrl: null,
          done: false,
          doneAt: null,
          comment: '',
          position: lastLink,
          error: null,
          analyzedAt: null,
          createdAt: note.createdAt,
          deletedAt: null,
        }),
        note.editedAt,
      ),
    );
  }

  return { records, uploads, noteCount: asNotes.length, linkCount: asLinks.length };
}
