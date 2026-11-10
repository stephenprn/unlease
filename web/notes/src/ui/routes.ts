/**
 * Carnet's places, all under `/notes`: the board and its views, a note over the board it was opened
 * from, a collection, a link over its collection, the lists of collections and labels, « Ce que Claude
 * relève » (`/notes/facts`), a collection's facts (`/notes/facts/<collection>`) and a kind's usual facts
 * (`/notes/facts/kind-recipe`), and the capture links of the installed app (`/notes/capture/note`, its
 * shortcuts and share target). The old `/notes/templates` addresses read as the same places.
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
    /** A collection's facts (its id), or a kind's usual facts (`kind-recipe`; `app/templates`' `templateKey`). */
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
  if (rest === '/facts' || rest === '/templates') return { name: 'templates' };
  const match = /^\/(label|note|line|link|facts|templates|capture)\/([^/]+)$/.exec(rest);
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
    case 'facts':
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
  /** « Ce que Claude relève ». */
  templates: `${HOME}/facts`,
  /** A collection's facts (its id), or a kind's usual facts (`kind-<kind>`). */
  template: (part: string): string => `${HOME}/facts/${encodeURIComponent(part)}`,
  trash: `${HOME}/trash`,
} as const;
