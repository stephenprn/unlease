/**
 * What leans on Claude shows only once the server has said it has a key (`useServerFeature`): a
 * collection's « Ce que Claude relève », Claude's modules in « Modules », a link's « Relire la page »;
 * and an address of « Ce que Claude relève » leads back once the server says there is none.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '@test/library';
import { addLink, createLine, updateLink } from '../../app/store/actions';
import { setReading } from '../../app/store/prefs';
import { setServerSettings } from '@shared/app/store/serverSettings';
import { setOnboarded, setServer } from '@shared/app/store/settings';
import { stopSync } from '@shared/app/sync/loop';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { LinkPanel } from '../features/links/LinkPanel';
import { LineScreen } from '../screens/LineScreen';

let line: string;
let link: string;

beforeEach(async () => {
  await freshLibrary();
  // The server answers nothing here: what it said is set by each test.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  setServer({ url: 'https://carnet.test', token: 'jeton' });
  line = createLine({ id: 'line-vins', title: 'Vins', hint: 'Bouteilles à goûter.' });
  link = addLink('https://www.cave.fr/margaux', { noteId: line });
  updateLink(link, { status: 'ready', title: 'Château Margaux', kind: 'product', price: 120, currency: 'EUR' });
});

afterEach(() => {
  stopSync();
  vi.unstubAllGlobals();
});

async function menuItems(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map(item => item.textContent ?? '');
}

describe('Claude’s entries in a collection', () => {
  it('hides « Ce que Claude relève » and Claude’s modules before the server has said, and without a key', async () => {
    const user = userEvent.setup();
    // Not known yet: nothing of Claude.
    const unknown = render(<LineScreen id={line} />);
    expect(await menuItems(user)).not.toContain('Ce que Claude relève');
    unknown.unmount();

    setReading(false);
    render(<LineScreen id={line} />);
    expect(await menuItems(user)).not.toContain('Ce que Claude relève');
    await user.click(screen.getByRole('menuitem', { name: 'Modules' }));
    const modules = screen.getByRole('dialog', { name: 'Modules' });
    expect(within(modules).queryByRole('switch', { name: /Codes promo/ })).not.toBeInTheDocument();
    expect(within(modules).queryByRole('switch', { name: /Demander à Claude/ })).not.toBeInTheDocument();
    expect(within(modules).queryByRole('region', { name: 'Tous les liens' })).not.toBeInTheDocument();
    // What needs no Claude stays.
    expect(within(modules).getByRole('switch', { name: /Y aller/ })).toBeInTheDocument();
  });

  it('shows them once the server says Claude has a key', async () => {
    const user = userEvent.setup();
    setServerSettings(parseServerSettings({ analysis: { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 } })!);
    render(<LineScreen id={line} />);
    expect(await menuItems(user)).toContain('Ce que Claude relève');
    await user.click(screen.getByRole('menuitem', { name: 'Modules' }));
    const modules = screen.getByRole('dialog', { name: 'Modules' });
    expect(within(modules).getByRole('switch', { name: /Codes promo/ })).toBeInTheDocument();
    expect(within(modules).getByRole('switch', { name: /Demander à Claude/ })).toBeInTheDocument();
  });

  it('offers a link’s « Relire la page » and its facts only with a key', async () => {
    const user = userEvent.setup();
    setReading(false);
    const off = render(<LinkPanel id={link} onClose={() => {}} />);
    let items = await menuItems(user);
    expect(items).not.toContain('Relire la page');
    expect(items).not.toContain('Ce que Claude relève');
    off.unmount();

    setReading(true);
    render(<LinkPanel id={link} onClose={() => {}} />);
    items = await menuItems(user);
    expect(items).toContain('Relire la page');
    expect(items).toContain('Ce que Claude relève');
  });
});

describe('an address of « Ce que Claude relève »', () => {
  beforeEach(() => {
    setOnboarded();
  });

  it('leads to Claude’s section of the Administration once the server says it has no key', async () => {
    history.replaceState(null, '', '/notes/facts');
    initHistory();
    render(<App />);
    // Not known yet: the page is drawn as it is.
    expect(location.pathname).toBe('/notes/facts');
    act(() => setReading(false));
    await waitFor(() => expect(location.pathname).toBe('/notes/admin/reading'));
  });

  it('leads a collection’s facts back to the collection', async () => {
    setReading(false);
    history.replaceState(null, '', `/notes/facts/${line}`);
    initHistory();
    render(<App />);
    await waitFor(() => expect(location.pathname).toBe(`/notes/line/${line}`));
  });

  it('stays where it is while Claude has a key', async () => {
    setReading(true);
    history.replaceState(null, '', `/notes/facts/${line}`);
    initHistory();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /Ce que Claude relève/ })).toBeInTheDocument();
    expect(location.pathname).toBe(`/notes/facts/${line}`);
  });
});
