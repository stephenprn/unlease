/**
 * Carnet's collections in Android's share sheet (Direct Share): the few that links were last saved or
 * filed into, each its emblem on its stone, published as sharing shortcuts (`Shortcuts`,
 * android/.../shortcuts). A share through one puts its links there, on the person's say
 * (`receiveShare`). Published at start, a moment after the collections change, and again once the
 * launcher's entry is switched (a dynamic shortcut belongs to the entry that was on). Only while the
 * app is in front otherwise: Android limits how often an app in the background changes them.
 */
import { AppState } from 'react-native';

import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { emblemShape } from '@unlease/design/emblems';
import { LINES } from '@unlease/design/palette';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, shownTitle, type Note } from '@unlease/notes/models/entities';
import { onLauncherIconSwitch } from '@shared/app/launcherIcon';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { appScheme } from '@shared/app/variant';
import { COLLECTION_SHORTCUT, setSharingShortcuts, sharingShortcutsAvailable } from '@platform/shortcuts';

import { linesOf } from './hooks/useLines';
import { useLibraryStore, type LibraryState } from './store/libraryStore';

/** What the share sheet shows of one app. */
export const SHARED_COLLECTIONS = 4;

/** A collection's sharing shortcut's id: the share it carries names it (`EXTRA_SHORTCUT_ID`). */
const PREFIX = COLLECTION_SHORTCUT;

/** A burst of writes (a sync page, typing) is looked at once. */
const PUBLISH_DELAY_MS = 1500;

type Library = Pick<LibraryState, 'notes' | 'noteOrder' | 'links' | 'linksByNote'>;

/** When a link was last saved into the collection or filed there by Claude; its own creation when it holds none. */
function lastFiled(line: Note, library: Library): number {
  let at = line.createdAt;
  for (const id of library.linksByNote[line.id] ?? []) {
    const link = library.links[id];
    if (link) at = Math.max(at, link.createdAt, link.analyzedAt ?? 0);
  }
  return at;
}

/** The collections the share sheet offers, the latest filed into first; never « Non classé » (the app's own line is that). */
export function sharedCollections(library: Library, count: number = SHARED_COLLECTIONS): Note[] {
  return linesOf(library.noteOrder, library.notes)
    .filter(line => line.id !== INBOX_ID)
    .map(line => ({ line, at: lastFiled(line, library) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, count)
    .map(entry => entry.line);
}

/** The live collection a share's shortcut names, or null (none, or since deleted: the share is filed as any). */
export function collectionOfShortcut(shortcutId: string | undefined, library: Pick<LibraryState, 'notes'> = useLibraryStore.getState()): string | null {
  if (!shortcutId?.startsWith(PREFIX)) return null;
  const line = library.notes[shortcutId.slice(PREFIX.length)];
  return line && line.kind === 'links' && line.deletedAt === null && line.trashedAt === null && line.id !== INBOX_ID ? line.id : null;
}

/** A collection as its shortcut: its title, what opening it from the launcher opens, its emblem in its pigment on its wash (by day: the pictures are static). */
export function sharingShortcut(line: Note) {
  const { d, rule } = emblemShape(collectionEmblem(line.id, line.emblem));
  const swatch = LINES.light[asLineColor(line.color) ?? 'grey'];
  return {
    id: `${PREFIX}${line.id}`,
    label: shownTitle(line).trim() || t('Sans titre'),
    uri: `${appScheme('notes')}://line/${line.id}`,
    path: d,
    evenOdd: rule === 'evenodd',
    stone: swatch.tint,
    ink: swatch.fill,
  };
}

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** What Android was last handed: unchanged, it is not sent again. */
let sent = '';

/** Once, after the library loads (bootstrap). */
export function startShareShortcuts(): void {
  if (started || !sharingShortcutsAvailable()) return;
  started = true;
  useLibraryStore.subscribe((state, previous) => {
    if (state.revision !== previous.revision) schedulePublish();
  });
  // An untitled collection's name follows the language.
  useSettingsStore.subscribe((state, previous) => {
    if (state.locale !== previous.locale) schedulePublish();
  });
  AppState.addEventListener('change', next => {
    if (next === 'active') schedulePublish();
  });
  // The entry turned off took them along: again at once, the app in the background or not.
  onLauncherIconSwitch(() => {
    sent = '';
    publishShareShortcuts().catch(() => undefined);
  });
  schedulePublish();
}

function schedulePublish(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (AppState.currentState === 'active') publishShareShortcuts().catch(() => undefined);
  }, PUBLISH_DELAY_MS);
}

/** Hands Android the collections to offer now, when they changed. */
export async function publishShareShortcuts(): Promise<void> {
  const shortcuts = JSON.stringify(sharedCollections(useLibraryStore.getState()).map(sharingShortcut));
  if (shortcuts === sent) return;
  const published = await setSharingShortcuts(shortcuts);
  // Declined (too many changes from the background): tried again the next time.
  if (published >= 0) sent = shortcuts;
}
