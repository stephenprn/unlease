import { describe, expect, it } from 'vitest';

import { LINE_COLORS } from '@unlease/design/colors';
import { avatarColor } from '../avatar';

describe('avatarColor', () => {
  it('gives a contact the same pigment every time, never grey', () => {
    const id = '0190f0f0-0000-7000-8000-000000000001';
    expect(avatarColor(id)).toBe(avatarColor(id));
    expect(LINE_COLORS).toContain(avatarColor(id));
    const seen = new Set(Array.from({ length: 200 }, (_, index) => avatarColor(`0190f0f0-0000-7000-8000-${String(index).padStart(12, '0')}`)));
    expect(seen.has('grey')).toBe(false);
    // Many ids spread over many pigments.
    expect(seen.size).toBeGreaterThan(6);
  });
});
