/** One theme object per mode and appearance: styles are kept per theme, so the same choice must give the same object. */
import { DEFAULT_APPEARANCE, PALETTE_COLORS, resolveAppearance } from '@unlease/design/appearance';
import { ROLES } from '@unlease/design/palette';

import { darkTheme, lightTheme, themeFor } from '../theme';

describe('themes', () => {
  it('are Carnet’s own for the default appearance', () => {
    expect(themeFor('light')).toBe(lightTheme);
    expect(themeFor('dark', { ...DEFAULT_APPEARANCE })).toBe(darkTheme);
    expect(lightTheme.color).toEqual(ROLES.light);
    expect(darkTheme.color).toEqual(ROLES.dark);
    expect(lightTheme.groundGrain).toBe(true);
  });

  it('keep one object per choice, painted with it', () => {
    const peony = { ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.pivoine, ground: { kind: 'preset', key: 'lilas' } as const };
    const theme = themeFor('light', peony);
    expect(themeFor('light', { ...peony })).toBe(theme);
    expect(theme).not.toBe(lightTheme);
    expect(theme.color.leaf).toBe(resolveAppearance(peony, 'light').roles.leaf);
    expect(theme.ground).toBe(resolveAppearance(peony, 'light').ground);
    expect(themeFor('dark', peony).mode).toBe('dark');
    // The ground's grain is part of the theme: a flat ground is another one.
    expect(themeFor('light', { ...peony, grain: false })).not.toBe(theme);
    expect(themeFor('light', { ...peony, grain: false }).groundGrain).toBe(false);
  });
});
