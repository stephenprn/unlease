/**
 * « Effacer des données » (Réglages › Données, in every app, on both clients): an app's records
 * erased for good, on this device, on the server and on every other device, in the parts the person
 * ticks (Agenda's own events but not its subscriptions, Carnet's notes but not its collections…).
 * Each app's package says its parts and what each one erases (`<app>/services/erase.ts`); this file
 * holds what every app shares: the guards, their checks and their words.
 *
 * The guards, in order: the parts are ticked one by one, each with how many things it holds; the
 * server's token is typed again (a device keeping everything to itself has none); the word
 * (`eraseWord`: « SUPPRIMER », "DELETE") is typed in capitals; then, when the server backs up to S3,
 * a backup runs first unless the person unticks it. Nothing is disabled to say why: pressed with a
 * problem, the form shows it under its field.
 *
 * Erasing writes a tombstone (`deletedAt`) on every record of the parts, in one batch, as « Vider la
 * corbeille » does: the sync carries it to the server and to every device, and nothing goes to the
 * bin. A record seeded on every device (Carnet's « Non classé ») is never erased.
 */
import { t, tx } from '../i18n';
import { plural } from './format';

/** One part an app can erase, as its row shows it: what it is, how many things it holds now. */
export interface ErasePart {
  /** Stable within its app (`events`, `subscriptions`): the form's choice. */
  readonly id: string;
  /** Its name, in the interface's language (« Vos événements »). */
  readonly title: string;
  /** What it holds now, counted (« 1 284 notes, dont 12 archivées »), or what erasing it does. */
  readonly detail: string;
  /** How many records a tick erases: 0 shows the row with nothing to tick. */
  readonly count: number;
  /** Its glyph's name (the design system's, which the core does not know). */
  readonly glyph: string;
}

/**
 * A change an erase writes, as each client's `writeLocal` takes it: a tombstone (`deletedAt`), or what
 * a record that stays loses with what goes (a label taken off the contacts it named).
 */
export interface EraseChange {
  readonly type: string;
  readonly id: string;
  readonly patch: Readonly<Record<string, unknown>>;
}

/** How many records a batch erases: its tombstones, not what the records that stay lose. */
export function erasedCount(changes: readonly EraseChange[]): number {
  return changes.filter(change => typeof change.patch.deletedAt === 'number').length;
}

/** The tombstones of `ids`, all of `type`, at one moment. */
export function tombstones(type: string, ids: Iterable<string>, now: number): EraseChange[] {
  return [...ids].map(id => ({ type, id, patch: { deletedAt: now } }));
}

/** The word typed to confirm, in the interface's language: « SUPPRIMER », "DELETE". */
const ERASE_WORD = tx('SUPPRIMER');

export function eraseWord(): string {
  return t(ERASE_WORD);
}

/** What is wrong with the word typed: nothing typed, or not the word (null: it is). Spaces around it do not count; its capitals do. */
export function eraseWordProblem(typed: string): string | null {
  const word = eraseWord();
  const given = typed.trim();
  if (!given) return t('Tapez {word} pour confirmer.', { word });
  if (given === word) return null;
  return given.toUpperCase() === word ? t('Tapez {word} en capitales.', { word }) : t('Tapez exactement {word}.', { word });
}

/** What is wrong with the token typed again: nothing typed (the server says when it is the wrong one). */
export function eraseTokenProblem(typed: string): string | null {
  return typed.trim() ? null : t('Saisissez le jeton de votre serveur.');
}

/** Nothing ticked, or nothing in what is ticked. */
export function erasePartsProblem(parts: readonly ErasePart[], chosen: ReadonlySet<string>): string | null {
  if (parts.every(part => !chosen.has(part.id))) return t('Cochez au moins une partie à effacer.');
  return eraseTotal(parts, chosen) > 0 ? null : t('Ce qui est coché ne contient rien.');
}

/** How many records the ticked parts hold. */
export function eraseTotal(parts: readonly ErasePart[], chosen: ReadonlySet<string>): number {
  return parts.reduce((sum, part) => sum + (chosen.has(part.id) ? part.count : 0), 0);
}

/** What the form starts from: every part that holds something, ticked (the person unticks what they keep). */
export function eraseDefaults(parts: readonly ErasePart[]): Set<string> {
  return new Set(parts.filter(part => part.count > 0).map(part => part.id));
}

/** The page's lead: what goes where, said before anything is ticked. */
export function eraseLead(app: string, connected: boolean): string {
  return connected
    ? t('Ce que vous effacez disparaît de {app} sur cet appareil, sur votre serveur et sur tous vos autres appareils. Rien ne passe par la corbeille.', { app })
    : t('Ce que vous effacez disparaît de {app} sur cet appareil. Rien ne passe par la corbeille.', { app });
}

/** The danger button's words: what it erases, counted. */
export function eraseAction(total: number): string {
  return total > 0 ? t('Effacer {items}', { items: plural(total, 'élément') }) : t('Effacer');
}

/** The slip once done. */
export function erasedMessage(total: number): string {
  return plural(total, 'élément effacé', 'éléments effacés');
}

/** Réglages › Données' row: its title and line. */
export function eraseRowWords(app: string): { readonly title: string; readonly meta: string } {
  return { title: t('Effacer des données'), meta: t('Tout ou partie de {app}, pour de bon, sur tous vos appareils', { app }) };
}

/** What the backup panel says, from the server's backup as it stands. */
export function eraseBackupWords(configured: boolean, lastSuccessAt: number | null, when: (at: number) => string): { readonly title: string; readonly meta: string } {
  if (!configured) return { title: t('Aucune sauvegarde sur S3'), meta: t('Ce qui est effacé ne pourra pas revenir. Une sauvegarde se règle dans l’Administration.') };
  return {
    title: t('Sauvegarder avant d’effacer'),
    meta: lastSuccessAt ? t('Une sauvegarde sur S3 juste avant, pour pouvoir revenir en arrière. La dernière date de {when}.', { when: when(lastSuccessAt) }) : t('Une sauvegarde sur S3 juste avant, pour pouvoir revenir en arrière.'),
  };
}

/** What the form says while it works, step by step. */
export const ERASE_PROGRESS = {
  checking: tx('Vérification du jeton…'),
  syncing: tx('Synchronisation…'),
  backup: tx('Sauvegarde sur S3…'),
  erasing: tx('Effacement…'),
} as const;

export type EraseProgress = keyof typeof ERASE_PROGRESS;
