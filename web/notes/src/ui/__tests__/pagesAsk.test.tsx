import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseServerSettings, type PagesAskSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '../../test/library';
import { usePagesAskStore } from '../../app/pagesAsk';
import { useLibraryStore } from '../../app/store/library';
import { createPage, insertBlock, setPagePrivate } from '../../app/store/pages';
import { resetServerSettings, setServerSettings } from '../../app/store/serverSettings';
import { useSettingsStore } from '../../app/store/settings';
import { askAboutPages } from '../../app/sync/transport';
import type * as Transport from '../../app/sync/transport';
import { WithPageAsk } from '../features/pages/AskPanel';
import { PageView } from '../features/pages/PageView';

vi.mock('../../app/sync/transport', async importOriginal => ({ ...(await importOriginal<typeof Transport>()), askAboutPages: vi.fn() }));

function offer(pages: Partial<PagesAskSettings> | null): void {
  setServerSettings(parseServerSettings({ analysis: { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 }, pages: { enabled: pages !== null, ...pages } })!);
}

/** A trip with a sub-page, and one kept away from Claude. */
function trip(): { page: string; hotels: string; secret: string; dates: string } {
  const page = createPage({ title: 'Lisbonne' });
  const dates = insertBlock(page, page, 0, { kind: 'text', text: 'Départ le 3 mai.' });
  const hotels = createPage({ title: 'Hôtels', parentId: page });
  insertBlock(hotels, hotels, 0, { kind: 'text', text: 'Près de l’Alfama.' });
  const secret = createPage({ title: 'Budget perso', parentId: page });
  insertBlock(secret, secret, 0, { kind: 'text', text: 'Salaire' });
  setPagePrivate(secret, true);
  return { page, hotels, secret, dates };
}

const view = (id: string) =>
  render(
    <WithPageAsk>
      <PageView id={id} />
    </WithPageAsk>,
  );

describe('Demander à Claude on a page', () => {
  beforeEach(async () => {
    await freshLibrary();
    resetServerSettings();
    usePagesAskStore.setState({ open: null, threads: {} });
    useSettingsStore.setState({ server: { url: 'https://carnet.example.org', token: 'secret-token' } });
    vi.mocked(askAboutPages).mockReset();
  });

  it('shows nothing until the Administration turns it on', () => {
    const { page } = trip();
    offer(null);
    view(page);
    expect(screen.queryByRole('button', { name: 'Demander à Claude' })).toBeNull();
  });

  it('asks about the page and its sub-pages, never a private one, and answers with its sources', async () => {
    const user = userEvent.setup();
    const { page, hotels, secret, dates } = trip();
    offer({});
    vi.mocked(askAboutPages).mockResolvedValue({
      parts: [{ text: 'Vous partez le 3 mai', cites: [0] }, { text: '.', cites: [] }],
      citations: [{ pageId: page, blockIds: [dates], quote: 'Départ le **3 mai**.' }],
      sources: [],
    });
    view(page);
    await user.click(screen.getByRole('button', { name: 'Demander à Claude' }));
    const panel = screen.getByRole('dialog', { name: 'Demander à Claude' });
    expect(within(panel).getByText(/Claude lit cette page et 1 sous-page/)).toBeInTheDocument();
    expect(within(panel).getByText('1 page gardée hors de Claude.')).toBeInTheDocument();
    await user.type(within(panel).getByRole('textbox', { name: 'Votre question' }), 'Quand est-ce que je pars ?{Enter}');
    await waitFor(() => expect(within(panel).getByText(/Vous partez le 3 mai/)).toBeInTheDocument());
    const request = vi.mocked(askAboutPages).mock.calls[0]![1];
    expect(request.scope).toBe('tree');
    expect(request.pages.map(sent => sent.id)).toEqual([page, hotels]);
    expect(request.pages.map(sent => sent.id)).not.toContain(secret);
    expect(request.question).toBe('Quand est-ce que je pars ?');
    expect(within(panel).getByRole('button', { name: 'Source 1 : Lisbonne' })).toBeInTheDocument();
    // The quote is read without its Markdown.
    expect(within(panel).getByText('« Départ le 3 mai. »')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Ajouter à la page' }));
    const added = useLibraryStore.getState().blocksByParent[page]!.map(id => useLibraryStore.getState().blocks[id]!);
    expect(added.find(block => block.kind === 'toggle')?.text).toBe('Quand est-ce que je pars ?');
  });

  it('keeps a private page and what is under it away, with a way to show it again', async () => {
    const user = userEvent.setup();
    const { secret } = trip();
    offer({});
    view(secret);
    expect(screen.queryByRole('button', { name: 'Demander à Claude' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Montrer à Claude' }));
    expect(useLibraryStore.getState().blocks[secret]!.private).toBe(false);
    expect(screen.getByRole('button', { name: 'Demander à Claude' })).toBeInTheDocument();
  });
});
