/** The shortcuts dialog as read in a test: each group's rows, its keys joined by « + » then what they do. */
import { screen, within } from '@testing-library/react';

export function shortcutGroups(): Map<string, string[]> {
  const dialog = screen.getByRole('dialog', { name: 'Raccourcis clavier' });
  const groups = new Map<string, string[]>();
  for (const section of dialog.querySelectorAll('section')) {
    const title = section.querySelector('h3')?.textContent ?? '';
    const rows = [...section.querySelectorAll('dt')].map(term => `${[...term.querySelectorAll('kbd')].map(key => key.textContent).join('+')} ${term.nextElementSibling?.textContent ?? ''}`);
    groups.set(title, rows);
  }
  return groups;
}

/** The dialog's group titles, in order. */
export const shortcutTitles = (): string[] => within(screen.getByRole('dialog', { name: 'Raccourcis clavier' })).getAllByRole('heading', { level: 3 }).map(head => head.textContent ?? '');
