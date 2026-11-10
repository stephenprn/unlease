import { describe, expect, it } from 'vitest';

import { noResults, searchSummary } from '../searchWords';

describe('searchSummary', () => {
  it('counts what was found', () => {
    expect(searchSummary('tarte', 1)).toBe('1\u00a0résultat');
    expect(searchSummary('tarte', 3, 2)).toBe('3\u00a0résultats');
  });

  it('says nothing was found, or nothing else under the settings found', () => {
    expect(searchSummary(' grain ', 0)).toBe(noResults('grain'));
    expect(searchSummary(' grain ', 0, 2)).toBe('Rien d’autre pour « grain »');
  });
});
