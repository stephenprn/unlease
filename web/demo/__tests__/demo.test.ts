import { afterEach, describe, expect, it, vi } from 'vitest';

import { startDemo } from '../demo';

const fetched = window.fetch;

/** A load of the demo at `address`: the language its settings start with. */
async function load(address: string): Promise<unknown> {
  history.replaceState(null, '', address);
  await startDemo('1');
  return (JSON.parse(localStorage.getItem('unlease-demo.settings') ?? 'null') as { locale?: unknown } | null)?.locale;
}

describe('the demo’s language', () => {
  afterEach(() => {
    window.fetch = fetched;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is the browser’s the first time, the one its address names, then the one it had: another app opened from the launcher speaks the same', async () => {
    const language = vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
    expect(await load('/notes?demo=1')).toBe('fr');
    localStorage.clear();
    language.mockReturnValue('en-GB');
    expect(await load('/notes?demo=1')).toBe('en');
    expect(await load('/pages?lang=fr')).toBe('fr');
    expect(await load('/agenda')).toBe('fr');
    expect(await load('/contacts?lang=en')).toBe('en');
    expect(await load('/notes')).toBe('en');
  });
});
