import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { createLine, createNote } from '@notes/app/store/actions';
import { setOnboarded, setServer, setServerApps } from '../../app/store/settings';
import { App } from '../App';
import { initHistory, navigate, otherApp, ownsPath, parseRoute } from '../router';

function open(path: string): void {
  history.replaceState(null, '', path);
  initHistory();
}

describe('Carnet’s web app’s places', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads its places under /notes, the shell’s under /notes too, and none of Pages’', () => {
    expect(parseRoute('/notes')).toEqual({ name: 'board', view: 'notes' });
    expect(parseRoute('/notes/reminders')).toEqual({ name: 'board', view: 'reminders' });
    expect(parseRoute('/notes/trash')).toEqual({ name: 'board', view: 'trash' });
    expect(parseRoute('/notes/label/a%20b')).toEqual({ name: 'board', view: 'label:a b' });
    expect(parseRoute('/notes/note/n1')).toEqual({ name: 'note', id: 'n1' });
    expect(parseRoute('/notes/line/l1/')).toEqual({ name: 'line', id: 'l1' });
    expect(parseRoute('/notes/link/k1')).toEqual({ name: 'link', id: 'k1' });
    expect(parseRoute('/notes/lines')).toEqual({ name: 'lines' });
    expect(parseRoute('/notes/labels')).toEqual({ name: 'labels' });
    expect(parseRoute('/notes/capture/share')).toEqual({ name: 'capture', kind: 'share' });
    expect(parseRoute('/notes/capture/other')).toEqual({ name: 'notFound' });
    expect(parseRoute('/')).toEqual({ name: 'home' });
    expect(parseRoute('/notes/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('/notes/admin')).toEqual({ name: 'admin', section: null });
    expect(parseRoute('/notes/admin/backup')).toEqual({ name: 'admin', section: 'backup' });
    // Pages' places are Pages' web app's; the shell's are under the app's path, never at the top.
    expect(parseRoute('/pages')).toEqual({ name: 'notFound' });
    expect(parseRoute('/pages/p1')).toEqual({ name: 'notFound' });
    expect(parseRoute('/settings')).toEqual({ name: 'notFound' });
    expect(parseRoute('/admin')).toEqual({ name: 'notFound' });
    expect(parseRoute('/note/n1')).toEqual({ name: 'notFound' });
    expect(ownsPath('/notes/note/n1')).toBe(true);
    expect(ownsPath('/pages/p1')).toBe(false);
  });

  it('opens its home at /', async () => {
    createNote({ kind: 'text', title: 'Courses' });
    open('/');
    render(<App />);
    await waitFor(() => expect(location.pathname).toBe('/notes'));
    expect(screen.getByRole('link', { name: /Courses/ })).toBeInTheDocument();
  });

  it('opens another app’s place in that app’s own web app, loaded whole', () => {
    const load = vi.spyOn(otherApp, 'open').mockImplementation(() => undefined);
    open('/notes');
    navigate('/pages/p1');
    expect(load).toHaveBeenCalledWith('/pages/p1');
    expect(location.pathname).toBe('/notes');
    navigate('/notes/lines');
    expect(location.pathname).toBe('/notes/lines');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('says so in place of its pages when the server does not run it, the way to turn it on there, the Réglages still in reach', async () => {
    setServer({ url: 'https://unlease.test', token: 'jeton' });
    setServerApps(['pages']);
    const line = createLine({ title: 'Films' });
    open(`/notes/line/${line}`);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Carnet n’est pas activé sur ce serveur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activer Carnet' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Films' })).not.toBeInTheDocument();
    expect(location.pathname).toBe(`/notes/line/${line}`);
  });

  it('names the tab after the page and the app', async () => {
    open('/notes/lines');
    const { unmount } = render(<App />);
    await waitFor(() => expect(document.title).toBe('Collections · Carnet'));
    unmount();
    open('/notes/settings');
    render(<App />);
    await waitFor(() => expect(document.title).toBe('Réglages · Carnet'));
  });
});

describe('the app’s brand', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  it('is the app’s mark and its name, a link to its home, with no switch in the navigation', () => {
    open('/notes/lines');
    render(<App />);
    expect(screen.getByRole('link', { name: 'Carnet, accueil' })).toHaveAttribute('href', '/notes');
    expect(screen.queryByRole('group', { name: 'Applications' })).not.toBeInTheDocument();
  });
});

describe('the launcher', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the apps the server runs, each opening its own web app', async () => {
    const user = userEvent.setup();
    const load = vi.spyOn(otherApp, 'open').mockImplementation(() => undefined);
    open('/notes');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Applications Unlease' }));
    const dialog = await screen.findByRole('dialog', { name: 'Applications Unlease' });
    const apps = within(dialog).getByRole('list', { name: 'Applications' });
    expect(within(apps).getAllByRole('link').map(link => link.textContent)).toEqual(['Carnet', 'Pages', 'Agenda', 'Contacts']);
    expect(within(apps).getByRole('link', { name: 'Carnet' })).toHaveAttribute('aria-current', 'true');
    // The Administration is at the navigation's foot, not in the launcher.
    expect(within(dialog).queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    // Every app is ready: nothing is announced.
    expect(within(dialog).queryByRole('list', { name: 'Bientôt disponible' })).not.toBeInTheDocument();
    await user.click(within(apps).getByRole('link', { name: 'Pages' }));
    expect(load).toHaveBeenCalledWith('/pages');
  });

  it('leaves out an app the server does not run', async () => {
    const user = userEvent.setup();
    setServer({ url: 'https://unlease.test', token: 'jeton' });
    setServerApps(['notes']);
    open('/notes');
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Applications Unlease' }));
    const apps = within(await screen.findByRole('dialog', { name: 'Applications Unlease' })).getByRole('list', { name: 'Applications' });
    expect(within(apps).getAllByRole('link').map(link => link.textContent)).toEqual(['Carnet']);
  });

  it('leaves the Administration to the navigation’s foot, under the Réglages: its sections, none of the app’s actions', async () => {
    const user = userEvent.setup();
    open('/notes');
    render(<App />);
    const nav = (): HTMLElement => screen.getAllByRole('navigation', { name: 'Navigation' })[0]!;
    await user.click(within(nav()).getByRole('link', { name: 'Administration' }));
    await waitFor(() => expect(location.pathname).toBe('/notes/admin'));
    expect(document.title).toBe('Administration · Carnet');
    expect(screen.queryByRole('button', { name: 'Classer un lien' })).not.toBeInTheDocument();
    await user.click(within(nav()).getByRole('link', { name: 'Sauvegarde sur S3' }));
    await waitFor(() => expect(location.pathname).toBe('/notes/admin/backup'));
    await waitFor(() => expect(document.title).toBe('Sauvegarde sur S3 · Administration · Carnet'));
    expect(screen.getByRole('heading', { level: 1, name: 'Sauvegarde sur S3' })).toBeInTheDocument();
    // Its brand stays the app's: home is one click away.
    expect(screen.getByRole('link', { name: 'Carnet, accueil' })).toHaveAttribute('href', '/notes');
  });
});
