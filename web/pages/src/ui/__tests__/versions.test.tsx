import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotBlocks } from '@unlease/pages/services/versions';
import type { PageVersion } from '@unlease/pages/sync/versions';

import { freshLibrary } from '@test/library';
import { fetchPageVersion, fetchPageVersions } from '../../app/api';
import { useBlocksStore } from '../../app/store/blocks';
import { createPage, insertBlock, updateBlock } from '../../app/store/pages';
import { getRecord } from '@shared/app/store/records';
import { useSettingsStore } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { PageView } from '../features/pages/PageView';

vi.mock('../../app/api', () => ({ fetchPageVersions: vi.fn(), fetchPageVersion: vi.fn(), askAboutPages: vi.fn() }));

const state = () => useBlocksStore.getState();

describe('a page’s version history', () => {
  beforeEach(async () => {
    await freshLibrary();
    useSettingsStore.setState({ server: { url: 'https://carnet.example.org', token: 'secret-token' } });
    vi.mocked(fetchPageVersions).mockReset();
    vi.mocked(fetchPageVersion).mockReset();
  });

  it('lists the versions by day, shows one against the page now, and restores it with Undo', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    const task = insertBlock(page, page, 0, { kind: 'todo', text: 'Passeport' });
    const blocks = snapshotBlocks(page, { fieldsOf: id => getRecord('block', id)?.fields, childrenOf: id => state().blocksByParent[id] ?? [] })!;
    const at = Date.now() - 60 * 60_000;
    const kept: PageVersion = { id: 7, at, pageId: page, blocks };
    updateBlock(page, task, { checked: true });
    vi.mocked(fetchPageVersions).mockResolvedValue({ versions: [{ id: 7, at, blocks: 1, change: { added: 1, removed: 0, changed: 0 } }] });
    vi.mocked(fetchPageVersion).mockResolvedValue(kept);

    render(<PageView id={page} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Historique des versions' }));
    const dialog = await screen.findByRole('dialog', { name: 'Versions de Voyage' });
    expect(within(dialog).getByText('Aujourd’hui')).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: /1\s+bloc ajouté/ }));
    await waitFor(() => expect(within(dialog).getByText('Passeport')).toBeInTheDocument());
    expect(within(dialog).getByText(/^1\s+bloc modifié$/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Restaurer cette version' }));
    expect(state().blocks[task]!.checked).toBe(false);
    expect(useUiStore.getState().snack?.message).toBe('Version restaurée');
    useUiStore.getState().snack!.action!.run();
    expect(state().blocks[task]!.checked).toBe(true);
  });

  it('says the history needs a server without one', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ server: null });
    const page = createPage({ title: 'Voyage' });
    render(<PageView id={page} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Historique des versions' }));
    expect(await screen.findByText('L’historique des versions a besoin de votre serveur : connectez-en un dans les réglages.')).toBeInTheDocument();
    expect(fetchPageVersions).not.toHaveBeenCalled();
  });
});
