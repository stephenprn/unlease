/**
 * Pages' places, all under `/pages`: the home (the recent pages and the tree), the bin, and a page
 * (`#block-<id>` lands on one of its blocks).
 */
import { decodePart, type Route } from '@shared/ui/router';

declare module '@shared/ui/router' {
  interface Routes {
    readonly pages: object;
    readonly pagesTrash: object;
    readonly page: { readonly id: string };
  }
}

export const PAGES_ROUTES = ['pages', 'pagesTrash', 'page'] as const satisfies readonly Route['name'][];

export const HOME = '/pages';

export function parsePagesRoute(path: string): Route | null {
  if (path === HOME) return { name: 'pages' };
  if (path === `${HOME}/trash`) return { name: 'pagesTrash' };
  const match = /^\/pages\/([^/]+)$/.exec(path);
  return match ? { name: 'page', id: decodePart(match[1]!) } : null;
}

/** Pages' places (the shell's, `settings` and `admin`, are `@shared/ui/router`'s `paths`). */
export const paths = {
  pages: HOME,
  trash: `${HOME}/trash`,
  page: (id: string): string => `${HOME}/${encodeURIComponent(id)}`,
} as const;
