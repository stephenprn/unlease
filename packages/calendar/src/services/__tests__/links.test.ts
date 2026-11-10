import { describe, expect, it } from 'vitest';

import { relativeWhen } from '../eventText';
import { cleanEventUrl, linkParts, readsAsEventUrl } from '../links';

describe('an event’s link', () => {
  it('reads as a link once tidied, or not at all', () => {
    expect(readsAsEventUrl('')).toBe(true);
    expect(readsAsEventUrl('visio.exemple.org/salle')).toBe(true);
    expect(readsAsEventUrl('tel:+33612345678')).toBe(true);
    expect(readsAsEventUrl('salle 3 au fond')).toBe(false);
  });

  it('is kept as Carnet keeps a link: its tracking off', () => {
    expect(cleanEventUrl('  https://www.example.org/billets?utm_source=mail&utm_medium=x&place=12#top ')).toEqual({ url: 'https://www.example.org/billets?place=12', removed: ['utm_source', 'utm_medium'] });
    expect(cleanEventUrl('example.org/visio').url).toBe('https://example.org/visio');
    expect(cleanEventUrl('Salle B, 2e étage').url).toBe('Salle B, 2e étage');
    expect(cleanEventUrl('   ').url).toBe('');
  });

  it('reads as its site, then the rest of its address', () => {
    expect(linkParts('https://www.visitlisboa.com/')).toEqual({ host: 'visitlisboa.com', rest: '' });
    expect(linkParts('https://meet.example.org/abc-def?pwd=1')).toEqual({ host: 'meet.example.org', rest: '/abc-def?pwd=1' });
  });
});

describe('how near an occurrence is', () => {
  const at = (wall: string): number => new Date(`${wall}:00`).getTime();
  const item = (start: string, end: string) => ({ startAt: at(start), endAt: at(end), allDay: false, firstDay: start.slice(0, 10), lastDay: end.slice(0, 10) });
  it('says it in words', () => {
    const now = at('2026-11-02T10:00');
    expect(relativeWhen(item('2026-11-02T09:30', '2026-11-02T10:30'), now, '2026-11-02')).toBe('En cours');
    expect(relativeWhen(item('2026-11-02T10:20', '2026-11-02T11:00'), now, '2026-11-02')).toBe('Dans 20 min');
    expect(relativeWhen(item('2026-11-02T13:00', '2026-11-02T14:00'), now, '2026-11-02')).toBe('Dans 3\u00a0heures');
    expect(relativeWhen(item('2026-11-02T08:00', '2026-11-02T09:00'), now, '2026-11-02')).toBe('Terminé');
    expect(relativeWhen(item('2026-11-03T08:00', '2026-11-03T09:00'), now, '2026-11-02')).toBe('Demain');
    expect(relativeWhen({ startAt: 0, endAt: 0, allDay: true, firstDay: '2026-11-01', lastDay: '2026-11-03' }, now, '2026-11-02')).toBe('En cours');
  });
});
