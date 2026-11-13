/**
 * « Autres agendas »: an address tried by the server before it is followed; one that asks for a
 * login shows its fields, the calendar is followed under the id its login was kept with, and a
 * refusal is said in the form with nothing followed.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { setServer } from '@shared/app/store/settings';
import { stopSync } from '@shared/app/sync/loop';
import { useCalendarStore } from '../../app/store/library';
import { FeedsScreen } from '../screens/FeedsScreen';

const DAV = 'https://mail.example.org/dav/caldav/Y2FsOi8vMC8x';
const asked: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(async () => {
  await freshLibrary();
  asked.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.endsWith('/api/calendar/feeds/connect')) return new Response('{}', { status: 404 });
      const body = JSON.parse(String(init?.body)) as { id: string; url: string; login?: { username: string; password: string } };
      asked.push({ url, body });
      if (!body.login) return Response.json({ status: 'login' });
      if (body.login.password !== 'secret') return Response.json({ error: 'Identifiant ou mot de passe refusé' }, { status: 422 });
      return Response.json({ status: 'ready', kind: 'caldav', url: DAV, name: 'Travail' });
    }),
  );
  setServer({ url: 'https://unlease.test', token: 'jeton' });
});

afterEach(() => {
  stopSync();
  vi.unstubAllGlobals();
});

const live = () => Object.values(useCalendarStore.getState().feeds).filter(feed => feed.deletedAt === null);

describe('subscribing to a calendar behind a login', () => {
  it('asks for the login, says a refusal, and follows the calendar over CalDAV with its account', async () => {
    const user = userEvent.setup();
    render(<FeedsScreen />);
    await user.type(screen.getByLabelText('Adresse de l’agenda'), DAV);
    await user.click(screen.getByRole('button', { name: 'S’abonner' }));
    expect(await screen.findByText('Cet agenda demande un identifiant : celui du compte qui le tient.')).toBeInTheDocument();
    expect(live()).toHaveLength(0);

    await user.type(screen.getByLabelText('Identifiant'), 'lea@example.org');
    await user.type(screen.getByLabelText('Mot de passe'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'S’abonner' }));
    expect(await screen.findByText('Identifiant ou mot de passe refusé')).toBeInTheDocument();
    expect(live()).toHaveLength(0);

    await user.clear(screen.getByLabelText('Mot de passe'));
    await user.type(screen.getByLabelText('Mot de passe'), 'secret');
    await user.click(screen.getByRole('button', { name: 'S’abonner' }));
    await waitFor(() => expect(live()).toHaveLength(1));
    const [feed] = live();
    expect(feed).toMatchObject({ kind: 'caldav', url: DAV, name: 'Travail', account: 'lea@example.org' });
    // One id from the first try to the last: the server kept the login under it.
    expect(new Set(asked.map(call => call.body.id))).toEqual(new Set([feed!.id]));
    // The password went to the server only, never into the record.
    expect(JSON.stringify(feed)).not.toContain('secret');
    expect(await screen.findByText(`${DAV} · en tant que lea@example.org`)).toBeInTheDocument();
  });
});
