import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Place } from '@unlease/core/sync/places';
import { placeFromLine } from '@unlease/core/sync/places';

import { useSettingsStore } from '../../../app/store/settings';
import { PlaceField } from '../PlaceField';

const LYON: Place = { label: '12 Rue des Lilas, 69003 Lyon', name: '12 Rue des Lilas', detail: '69003 Lyon, France', street: '12 Rue des Lilas', postalCode: '69003', city: 'Lyon', region: '', country: 'France', lat: 45.75, lon: 4.86 };

function Harness({ onPick, known = [] }: { onPick?: (place: Place) => void; known?: readonly Place[] }) {
  const [value, setValue] = useState('');
  return <PlaceField label="Lieu" value={value} onChange={setValue} onPick={onPick} known={known} />;
}

describe('PlaceField', () => {
  const asked: string[] = [];
  beforeEach(() => {
    asked.length = 0;
    useSettingsStore.setState({ server: { url: 'https://unlease.example.org', token: 'secret' } });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return new Response(JSON.stringify({ places: [LYON] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useSettingsStore.setState({ server: null });
  });

  it('offers the places it knows first, then the server’s, and fills the line with the one picked', async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} known={[placeFromLine('Arkose Montreuil, Montreuil'), placeFromLine('12 rue des Lilas, Paris')]} />);
    const field = screen.getByRole('combobox', { name: 'Lieu' });
    act(() => field.focus());
    // Nothing typed yet: what this device knows.
    expect(await screen.findByRole('option', { name: /Arkose Montreuil/ })).toBeTruthy();
    fireEvent.change(field, { target: { value: '12 rue' } });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    const options = screen.getAllByRole('option');
    expect(options[0]!.textContent).toContain('12 rue des Lilas');
    expect(options[1]!.textContent).toContain('69003 Lyon, France');
    expect(asked[0]).toContain('/api/places?q=12+rue&lang=fr');
    expect(screen.getByText('Lieux : © les contributeurs d’OpenStreetMap')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect((field as HTMLInputElement).value).toBe('12 Rue des Lilas, 69003 Lyon');
    expect(onPick).toHaveBeenCalledWith(LYON);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says when the search does not answer, the line kept as written', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 502 }));
    render(<Harness />);
    const field = screen.getByRole('combobox', { name: 'Lieu' });
    act(() => field.focus());
    fireEvent.change(field, { target: { value: 'quelque part' } });
    expect(await screen.findByText('La recherche de lieux ne répond pas : le lieu est gardé tel qu’il est écrit.')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((field as HTMLInputElement).value).toBe('quelque part');
  });
});
