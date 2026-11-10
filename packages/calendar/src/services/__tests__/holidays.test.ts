import { setLocale } from '@unlease/core/i18n';
import { birthdayTitle } from '../eventText';
import { feedName, holidaysAddress } from '../holidays';

describe('the holidays calendar’s name', () => {
  afterEach(() => setLocale('fr'));

  it('is said in the interface’s language from its country, other calendars as they were named', () => {
    const holidays = { kind: 'holidays' as const, name: 'Jours fériés · Allemagne (DE-BY)', url: holidaysAddress('DE-BY') };
    setLocale('fr');
    expect(feedName(holidays)).toBe('Jours fériés · Allemagne (DE-BY)');
    expect(feedName({ ...holidays, url: holidaysAddress('FR') })).toBe('Jours fériés · France');
    setLocale('en');
    expect(feedName({ ...holidays, url: holidaysAddress('FR') })).toBe('Public holidays · France');
    // From a server that did not say its country: the stored name.
    expect(feedName({ ...holidays, url: '' })).toBe('Jours fériés · Allemagne (DE-BY)');
    expect(feedName({ kind: 'ics', name: 'Club de foot', url: 'https://example.org/foot.ics' })).toBe('Club de foot');
  });
});

describe('a birthday’s title', () => {
  it('elides « de » before a vowel', () => {
    setLocale('fr');
    expect(birthdayTitle('Étienne Lefèvre', 51)).toBe('Anniversaire d’Étienne Lefèvre (51\u00a0ans)');
    expect(birthdayTitle('Léa Martin', null)).toBe('Anniversaire de Léa Martin');
  });
});
