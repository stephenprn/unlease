import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { shortcutGroups, shortcutTitles } from '@test/shortcuts';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { getLocation, initHistory } from '@shared/ui/router';
import { trashedPages } from '../../app/store/pages';
import { useBlocksStore } from '../../app/store/blocks';

const pageCount = (): number => Object.values(useBlocksStore.getState().blocks).filter(block => block.kind === 'page' && block.deletedAt === null).length - trashedPages().length;

describe('Pages’ keys', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  // C makes the app's thing in every app; P, Pages' key before, still does.
  it('makes a page on C, as every app makes its thing, and still on P', async () => {
    const user = userEvent.setup();
    history.replaceState(null, '', '/pages');
    initHistory();
    render(<App />);
    const before = pageCount();
    await user.keyboard('c');
    await waitFor(() => expect(pageCount()).toBe(before + 1));
    expect(getLocation().path).toMatch(/^\/pages\/./);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('p');
    await waitFor(() => expect(pageCount()).toBe(before + 2));
  });

  it('lists C for a new page and a page’s keys in the shortcuts dialog', async () => {
    const user = userEvent.setup();
    history.replaceState(null, '', '/pages');
    initHistory();
    render(<App />);
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeInTheDocument();
    expect(shortcutTitles()).toEqual(['Partout', 'Dans une page']);
    expect(shortcutGroups().get('Partout')).toContain('C Nouvelle page');
    expect(shortcutGroups().get('Partout')!.some(row => row.startsWith('P '))).toBe(false);
    expect(shortcutGroups().get('Dans une page')).toContain('/ Ajouter un bloc');
  });
});
