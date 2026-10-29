import { isValidField } from '@unlease/core/sync/schema';
import { EMBLEMS } from '@unlease/design/emblems';
import { collectionEmblem, emblemOf, nextEmblem } from '../collections';
import { INBOX_ID } from '../entities';
import '../../sync/types';

describe('collection emblems', () => {
  it('draws the chosen emblem, else one picked from the id, the same on every device', () => {
    expect(emblemOf('line-1', 'lune')).toBe('lune');
    expect(emblemOf('line-1', null)).toBe(emblemOf('line-1', null));
    expect(EMBLEMS).toContain(emblemOf('line-1', 'a-key-from-a-newer-client'));
  });

  it('gives a starter collection its designed emblem until one is chosen', () => {
    expect(emblemOf('line-films', null)).toBe('etoile');
    expect(emblemOf('line-films', 'lune')).toBe('lune');
  });

  it('keeps the tray for "Non classé" whatever it stores', () => {
    expect(collectionEmblem(INBOX_ID, 'etoile')).toBe('bac');
  });

  it('hands out emblems no collection shows yet, stored or derived', () => {
    expect(nextEmblem([])).toBe(EMBLEMS[0]);
    expect(nextEmblem([{ id: 'a', emblem: EMBLEMS[0] }])).toBe(EMBLEMS[1]);
    // A starter without a stored emblem still shows its designed one.
    expect(nextEmblem([{ id: 'a', emblem: EMBLEMS[0] }, { id: 'line-films', emblem: null }])).not.toBe('etoile');
    expect(EMBLEMS).toContain(nextEmblem(EMBLEMS.map((emblem, i) => ({ id: `c${i}`, emblem }))));
  });

  it('syncs any well-formed key, so a peer passes a newer one on', () => {
    expect(isValidField('note', 'emblem', 'feuille')).toBe(true);
    expect(isValidField('note', 'emblem', 'comete')).toBe(true);
    expect(isValidField('note', 'emblem', null)).toBe(true);
    expect(isValidField('note', 'emblem', '<svg>')).toBe(false);
  });
});

