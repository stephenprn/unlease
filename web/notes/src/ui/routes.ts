/**
 * Carnet's places, all under `/notes`: the board and its views, a note over the board it was opened
 * from, a collection, a link over its collection, the lists of collections and labels, the « Modèles
 * de fiche » and a template's editor (`/notes/templates/kind-recipe`, `/notes/templates/new`, one of
 * the person's own by its id), and the capture links of the installed app (`/notes/capture/note`,
 * its shortcuts and share target).
 */
import { decodePart, type Route } from '@shared/ui/router';

import type { BoardView } from '../app/hooks/useBoard';

export type CaptureKind = 'note' | 'checklist' | 'link' | 'share';

declare module '@shared/ui/router' {
  interface Routes {
    readonly board: { readonly view: BoardView };
    readonly note: { readonly id: string };
    readonly line: { readonly id: string };
    readonly link: { readonly id: string };
    readonly lines: object;
    readonly labels: object;
    readonly templates: object;
    /** `new`, a kind's (`kind-recipe`) or one of the person's own by its id (`app/templates`' `templateKey`). */
    readonly template: { readonly id: string };
    readonly capture: { readonly kind: CaptureKind };
  }
}

/** Carnet's route names, for the shell to tell its places from another app's. */
export const NOTES_ROUTES = ['board', 'note', 'line', 'link', 'lines', 'labels', 'templates', 'template', 'capture'] as const satisfies readonly Route['name'][];

export const HOME = '/notes';

export function parseNotesRoute(path: string): Route | null {
  if (path === HOME) return { name: 'board', view: 'notes' };
  if (!path.startsWith(`${HOME}/`)) return null;
  const rest = path.slice(HOME.length);
  if (rest === '/reminders') return { name: 'board', view: 'reminders' };
  if (rest === '/archive') return { name: 'board', view: 'archive' };
  if (rest === '/trash') return { name: 'board', view: 'trash' };
  if (rest === '/lines') return { name: 'lines' };
  if (rest === '/labels') return { name: 'labels' };
  if (rest === '/templates') return { name: 'templates' };
  const match = /^\/(label|note|line|link|templates|capture)\/([^/]+)$/.exec(rest);
  if (!match) return null;
  const id = decodePart(match[2]!);
  switch (match[1]) {
    case 'label':
      return { name: 'board', view: `label:${id}` };
    case 'note':
      return { name: 'note', id };
    case 'line':
      return { name: 'line', id };
    case 'link':
      return { name: 'link', id };
    case 'templates':
      return { name: 'template', id };
    default:
      return id === 'note' || id === 'checklist' || id === 'link' || id === 'share' ? { name: 'capture', kind: id } : null;
  }
}

export function pathForView(view: BoardView): string {
  if (view === 'notes') return HOME;
  if (view === 'reminders') return `${HOME}/reminders`;
  if (view === 'archive') return `${HOME}/archive`;
  if (view === 'trash') return `${HOME}/trash`;
  return `${HOME}/label/${encodeURIComponent(view.slice(6))}`;
}

/** Carnet's places (the shell's, `settings` and `admin`, are `@shared/ui/router`'s `paths`). */
export const paths = {
  board: HOME,
  note: (id: string): string => `${HOME}/note/${encodeURIComponent(id)}`,
  line: (id: string): string => `${HOME}/line/${encodeURIComponent(id)}`,
  link: (id: string): string => `${HOME}/link/${encodeURIComponent(id)}`,
  lines: `${HOME}/lines`,
  labels: `${HOME}/labels`,
  templates: `${HOME}/templates`,
  /** A template's editor: `new` (`?for=<collection>` chooses it there once saved), `kind-<kind>`, or an id. */
  template: (part: string, forCollection?: string): string => `${HOME}/templates/${encodeURIComponent(part)}${forCollection ? `?for=${encodeURIComponent(forCollection)}` : ''}`,
  trash: `${HOME}/trash`,
} as const;
