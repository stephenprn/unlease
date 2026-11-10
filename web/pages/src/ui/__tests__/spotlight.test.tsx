import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { useBlocksStore } from '../../app/store/blocks';
import { createPage, insertBlock } from '../../app/store/pages';

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

/** The spotlight, opened with Ctrl+P (jsdom is no Mac). */
async function spotlight(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}p{/Control}');
  const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
  return { dialog, field: within(dialog).getByRole('combobox', { name: 'Rechercher' }) };
}

const options = (dialog: HTMLElement): string[] => within(dialog).queryAllByRole('option').map(option => option.textContent ?? '');

/** Pages' spotlight: its pages, by their titles and the words of their blocks. */
describe('the spotlight in Pages', () => {
  const scrolled = vi.fn();

  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    scrolled.mockClear();
    // jsdom draws nothing, so it has no scrollIntoView.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrolled, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('opens on Ctrl+P instead of printing, titles first, and opens a page at the block that matched', async () => {
    const user = userEvent.setup();
    const lisbonne = createPage({ title: 'Lisbonne' });
    const portugal = createPage({ title: 'Portugal' });
    insertBlock(portugal, portugal, 0, { kind: 'h2', text: 'Itinéraire' });
    const day = insertBlock(portugal, portugal, 1, { kind: 'text', text: 'Une semaine à Lisbonne, puis Porto' });
    open('/pages');
    render(<App />);
    expect(fireEvent.keyDown(document.body, { key: 'p', ctrlKey: true })).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Rechercher' }), 'lisbonne');
    const found = options(dialog);
    expect(found[0]).toMatch(/^Lisbonne/);
    expect(found[1]).toMatch(/^Portugal.*Une semaine à Lisbonne/);
    expect(within(dialog).getByText('Titres')).toBeInTheDocument();
    expect(within(dialog).getByText('Dans le contenu')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    // Why it matched: the words marked in the snippet.
    expect(within(within(dialog).getAllByRole('option')[1]!).getByText('Lisbonne', { selector: 'mark' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(location.pathname).toBe(`/pages/${portugal}`));
    // The page brings the block that matched into view.
    await waitFor(() => expect(scrolled.mock.contexts.some(element => (element as HTMLElement).dataset.selectBlock === day)).toBe(true));
    expect(lisbonne).toBeTruthy();
  });

  it('offers to create the page nothing is titled yet', async () => {
    const user = userEvent.setup();
    open('/pages');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'Voyage au Japon');
    await user.click(within(dialog).getByRole('option', { name: 'Créer la page « Voyage au Japon »' }));
    await waitFor(() => expect(location.pathname).toMatch(/^\/pages\/[^/]+$/));
    const id = decodeURIComponent(location.pathname.slice('/pages/'.length));
    expect(useBlocksStore.getState().blocks[id]?.text).toBe('Voyage au Japon');
  });

  it('opens a result in a new tab with Ctrl+Enter, staying open', async () => {
    const user = userEvent.setup();
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const page = createPage({ title: 'Archives familiales' });
    open('/pages');
    render(<App />);
    const { dialog, field } = await spotlight(user);
    await user.type(field, 'archives');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(windowOpen).toHaveBeenCalledWith(`/pages/${page}`, '_blank', 'noopener');
    expect(dialog).toBeInTheDocument();
  });

});
