/**
 * What a mention in a formatted note (`{@contact=<id>}`) reads as outside the editors: a search, a
 * card, a widget, the clipboard, a backup. Carnet's package reads no other app, so the program
 * names them: the clients from Contacts' records they hold (`setMentionNamer`, at start), the server
 * from its records while it writes a backup. A mention nobody names reads as gone.
 */
import { t, tx } from '@unlease/core/i18n';
import type { Ref } from '@unlease/core/refs';

/** A mention's subject by its name now; null when it is gone or unknown here. */
export type MentionNamer = (target: Ref) => string | null;

let namer: MentionNamer = () => null;
let version = 0;

/** The program's way of naming mentions; caches of what a note reads as (`noteCardLines`) start over. */
export function setMentionNamer(next: MentionNamer): void {
  namer = next;
  version += 1;
}

/** Bumped whenever the names may have changed: a cache keyed by a note keeps this too. */
export function mentionsVersion(): number {
  return version;
}

/** The program tells that the people it names changed (a rename): caches start over. */
export function mentionsChanged(): void {
  version += 1;
}

const GONE: Readonly<Record<string, string>> = { contact: tx('Contact supprimé'), event: tx('Événement supprimé') };

/** Its subject's name now, null when nobody names it here (gone, or this program holds no such records). */
export function knownName(target: Ref): string | null {
  return namer(target);
}

/** The names of the people a note or a link names (`contactIds`), those this program can name. */
export function peopleNames(ids: readonly string[]): string[] {
  return ids.flatMap(id => namer({ type: 'contact', id }) ?? []);
}

/** A mention as words: its subject's name, or what it was once gone. */
export function mentionName(target: Ref): string {
  const name = namer(target);
  if (name !== null) return name;
  const gone = GONE[target.type];
  return gone ? t(gone) : t('Indisponible ici');
}
