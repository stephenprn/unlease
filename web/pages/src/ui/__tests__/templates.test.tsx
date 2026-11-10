import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { pagesLibrary } from '../../app/store/blocks';
import { undoPage } from '../../app/store/pageHistory';
import { createPage, insertBlock, saveBlockText } from '../../app/store/pages';
import { PageView } from '../features/pages/PageView';

const state = () => pagesLibrary();
const kinds = (page: string): string[] => (state().blocksByParent[page] ?? []).map(id => state().blocks[id]!.kind);

describe('a new page', () => {
  beforeEach(async () => {
    await freshLibrary();
    // jsdom draws nothing to scroll to: the caret's block is brought into view by hand.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  });

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('offers its templates under the title while it holds nothing, and fills itself from one', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Point d’équipe' });
    render(<PageView id={page} />);
    const templates = screen.getByRole('group', { name: 'Partir d’un modèle' });
    expect(within(templates).getAllByRole('button').map(button => button.textContent)).toEqual(['Journal du jour', 'Réunion', 'Voyage', 'Liste de lecture', 'Projet']);
    await user.click(within(templates).getByRole('button', { name: 'Réunion' }));
    expect(kinds(page)).toEqual(['text', 'text', 'h2', 'bullet', 'h2', 'text', 'h2', 'bullet', 'h2', 'todo']);
    expect(state().blocks[page]).toMatchObject({ text: 'Point d’équipe', icon: '🤝' });
    expect(screen.queryByRole('group', { name: 'Partir d’un modèle' })).toBeNull();
    // One step of the page's undo: the page is blank again, and offers them again.
    undoPage(page);
    expect(kinds(page)).toEqual([]);
    expect(await screen.findByRole('group', { name: 'Partir d’un modèle' })).toBeInTheDocument();
  });

  it('keeps offering them over an empty paragraph, never once a word is written', () => {
    const page = createPage({});
    const paragraph = insertBlock(page, page, 0, { kind: 'text', text: '' });
    const { unmount } = render(<PageView id={page} />);
    expect(screen.getByRole('group', { name: 'Partir d’un modèle' })).toBeInTheDocument();
    unmount();
    saveBlockText(page, paragraph, '', 'Bonjour');
    render(<PageView id={page} />);
    expect(screen.queryByRole('group', { name: 'Partir d’un modèle' })).toBeNull();
  });
});

describe('« Déplacer vers »', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('lists the pages changed last first, then every page by where it sits', async () => {
    const user = userEvent.setup();
    const pages = Array.from({ length: 9 }, (_, index) => createPage({ title: `Page ${index + 1}` }, Date.now() + index));
    const moved = createPage({ parentId: pages[0]!, title: 'À ranger' });
    render(<PageView id={moved} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer vers…' }));
    const recent = await screen.findByRole('region', { name: 'Récentes' });
    expect(within(recent).getAllByRole('button')).toHaveLength(5);
    // The page it is in is ticked among every page, never offered as a recent one.
    expect(within(recent).queryByRole('button', { name: /^Page 1$/ })).toBeNull();
    const all = screen.getByRole('region', { name: 'Toutes les pages' });
    expect(within(all).getAllByRole('button').map(button => button.textContent?.trim())).toEqual(['Au premier niveauAvec les pages de l’accueil', ...pages.map((_, index) => `Page ${index + 1}`)]);
    // Typing keeps the pages that match, with no heads.
    await user.type(screen.getByRole('textbox', { name: 'Chercher une page' }), 'Page 3');
    expect(screen.queryByRole('region', { name: 'Récentes' })).toBeNull();
  });
});
