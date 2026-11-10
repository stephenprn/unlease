import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { addLink, createLine, updateLink } from '../../app/store/actions';
import { setServer, setServerApps } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { otherApp } from '@shared/ui/router';
import { ModuleBar } from '../features/links/ModuleBar';

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** « Garder une copie »: Pages makes the page on the server, and the link's `copy` points at it. */
describe('keeping a copy of an article', () => {
  let link: string;

  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://unlease.test', token: 'jeton' });
    const line = createLine({ title: 'À lire' });
    link = addLink('https://www.journal.fr/ville-30', { noteId: line });
    updateLink(link, { status: 'ready', kind: 'article', title: 'La ville à 30 km/h', siteName: 'Le Journal' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks Pages for the page with the link’s title, then opens the link’s copy in Pages’ own web app', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(otherApp, 'open').mockImplementation(() => undefined);
    const sent: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const { pathname } = new URL(url);
        sent.push({ path: pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
        return pathname === '/api/pages/copies' ? json({ pageId: 'page-copie' }) : json({ error: 'not found' }, 404);
      }),
    );
    render(<ModuleBar id={link} />);
    await user.click(screen.getByRole('button', { name: 'Garder une copie' }));
    await waitFor(() => expect(sent.some(request => request.path === '/api/pages/copies')).toBe(true));
    expect(sent.find(request => request.path === '/api/pages/copies')!.body).toEqual({ link: { id: link, url: 'https://www.journal.fr/ville-30' }, lang: 'fr', title: 'La ville à 30 km/h' });
    await waitFor(() => expect(useUiStore.getState().snack?.message).toBe('Copie gardée dans Pages'));

    // The server's change comes with the next pull: the link points at its page, and the module opens it, in Pages.
    act(() => updateLink(link, { copy: 'page-copie' }));
    await user.click(screen.getByRole('button', { name: 'Voir la copie' }));
    expect(open).toHaveBeenCalledWith('/pages/page-copie');
    expect(location.pathname).not.toBe('/pages/page-copie');
  });

  it('shows only when the server runs Pages', () => {
    setServerApps(['notes']);
    render(<ModuleBar id={link} />);
    expect(screen.queryByRole('button', { name: 'Garder une copie' })).not.toBeInTheDocument();
  });
});
