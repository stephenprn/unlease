/** What both clients say and draw alike: the slips, the lengths, the week's numbers, the layers' colours, the Administration's lines. */
import { setLocale } from '@unlease/core/i18n';
import type { ServerSettings } from '@unlease/core/sync/settings';
import { askLine, holidaysLine, publishLine } from '../admin';
import { LAYER_COLORS } from '../colors';
import { deletedForGoodWords, deletedWords, lengthWords, weekNumberShort } from '../eventText';
import { weekCodesFrom } from '../recurrence';

const settings = (calendar: Partial<ServerSettings['calendar']>, keyed = true): ServerSettings =>
  ({ analysis: { enabled: keyed }, calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false, ...calendar } }) as unknown as ServerSettings;

describe('the words both clients share', () => {
  beforeEach(() => setLocale('fr'));

  it('says where a deleted occurrence went: the bin for a whole event, out of its series otherwise', () => {
    const single = { repeats: false, occurrence: '2026-11-02T09:00' };
    const later = { repeats: true, occurrence: '2026-11-09T09:00' };
    expect(deletedWords(single, '2026-11-02T09:00', 'all')).toBe('Événement placé dans la corbeille');
    expect(deletedWords(later, '2026-11-02T09:00', 'all')).toBe('Événement placé dans la corbeille');
    expect(deletedWords(later, '2026-11-02T09:00', 'this')).toBe('Événement supprimé');
    expect(deletedWords(later, '2026-11-02T09:00', 'following')).toBe('Événement supprimé');
    // « This one and the following » from the first: the whole series.
    expect(deletedWords({ repeats: true, occurrence: '2026-11-02T09:00' }, '2026-11-02T09:00', 'following')).toBe('Événement placé dans la corbeille');
    expect(deletedForGoodWords(3)).toMatch(/^3\sévénements supprimés définitivement$/);
  });

  it('writes a length in minutes, hours, or both', () => {
    expect(lengthWords(45)).toMatch(/^45\sminutes$/);
    expect(lengthWords(60)).toMatch(/^1\sheure$/);
    expect(lengthWords(90)).toBe('1 h 30');
  });

  it('numbers a week the same in every view', () => {
    expect(weekNumberShort('2026-11-02')).toBe('S45');
  });

  it('orders the custom repeat’s days from the week’s first day', () => {
    expect(weekCodesFrom(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekCodesFrom(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekCodesFrom(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it('paints the other apps’ layers in one pigment each', () => {
    expect(LAYER_COLORS).toEqual({ birthday: 'pink', reminder: 'ochre', page: 'sky' });
  });

  it('gives the Administration’s lines', () => {
    expect(holidaysLine(settings({})).tone).toBe('off');
    expect(holidaysLine(settings({ holidays: { country: 'FR', region: 'FR-67' } })).title).toContain('FR-67');
    expect(publishLine(settings({ publishPath: '/ical/secret.ics' })).title).toBe('Agenda publié');
    expect(publishLine(settings({})).title).toBe('Agenda non publié');
    expect(askLine(settings({ ask: true }, false)).title).toBe('Sans clé Claude');
    expect(askLine(settings({ ask: true })).title).toBe('Questions activées');
  });
});
