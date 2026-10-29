import {
  accentRoles,
  DEFAULT_APPEARANCE,
  fitGround,
  gradientPaint,
  GROUND_PRESETS,
  groundPaint,
  groundReads,
  isDefaultAppearance,
  markColors,
  PALETTE_COLORS,
  paletteOf,
  PALETTES,
  parseAppearance,
  primaryRoles,
  randomGradient,
  resolveAppearance,
  sameGround,
  shuffleSeed,
  type Appearance,
  type GroundChoice,
} from '../appearance';
import { isHex } from '../color';
import { contrast, groundGradient, GROUNDS, MARK_COLORS, ROLES, toOklch, type Mode, type Roles } from '../palette';

const MODES: readonly Mode[] = ['light', 'dark'];

/** Deterministic colours spread over the whole cube, dark and light, grey and loud. */
function colours(count: number, seed: number): string[] {
  let state = seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return Array.from({ length: count }, () => `#${[next(), next(), next()].map(v => Math.floor(v * 256).toString(16).padStart(2, '0')).join('')}`.toUpperCase());
}

/** Every rule the palette test holds the default to, against what a ground shows. */
function expectReadable(roles: Roles, ground: readonly string[], label: string): void {
  const surfaces = [roles.wall, roles.paper, roles.paperHigh, roles.field, ...ground];
  const fails: string[] = [];
  const check = (name: string, value: number, least: number): void => {
    if (value < least) fails.push(`${name} ${value.toFixed(2)} < ${least}`);
  };
  for (const surface of surfaces) {
    check(`focus on ${surface}`, contrast(roles.focus, surface), 3);
    check(`action on ${surface}`, contrast(roles.action, surface), 3);
    check(`link on ${surface}`, contrast(roles.link, surface), 4.5);
  }
  check('onLeaf', contrast(roles.onLeaf, roles.leaf), 4.5);
  check('onAction', contrast(roles.onAction, roles.action), 4.5);
  check('onActionContainer', contrast(roles.onActionContainer, roles.actionContainer), 4.5);
  check('ink on the tonal wash', contrast(roles.ink, roles.actionContainer), 7);
  check('second ink on the tonal wash', contrast(roles.inkMuted, roles.actionContainer), 4.5);
  check('slip action', contrast(roles.slipAction, roles.slip), 4.5);
  check('ink on selected words', contrast(roles.ink, roles.highlight), 4.5);
  expect([label, fails]).toEqual([label, []]);
}

describe('the default', () => {
  it.each(MODES)('paints the palette’s own values in %s', mode => {
    const { roles, ground } = resolveAppearance(DEFAULT_APPEARANCE, mode);
    expect(roles).toEqual(ROLES[mode]);
    expect(ground.layers).toEqual([groundGradient(mode)]);
    expect(ground.gradients).toEqual([
      {
        kind: 'linear',
        stops: [
          { color: GROUNDS[mode].top, alpha: 1, at: 0 },
          { color: GROUNDS[mode].bottom, alpha: 1, at: 1 },
        ],
      },
    ]);
    expect(ground.base).toBe(ROLES[mode].wall);
  });

  it('is the matcha and terracotta pair on the grainy Carnet ground', () => {
    expect(isDefaultAppearance(DEFAULT_APPEARANCE)).toBe(true);
    expect(paletteOf(DEFAULT_APPEARANCE.primary, DEFAULT_APPEARANCE.accent)).toBe('carnet');
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, grain: false })).toBe(false);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.glycine })).toBe(false);
    // What one has made does not count until it is chosen.
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, ownColor: '#123456' })).toBe(true);
  });
});

describe.each(MODES)('%s', mode => {
  it('keeps every preset ground readable, every tone and blend of it', () => {
    for (const key of GROUND_PRESETS) {
      const paint = groundPaint({ kind: 'preset', key }, mode);
      for (const color of paint.colors) expect([key, color, groundReads(color, mode)]).toEqual([key, color, true]);
    }
  });

  it('keeps every palette readable on every preset ground', () => {
    for (const palette of PALETTES) {
      for (const key of GROUND_PRESETS) {
        const { roles, ground } = resolveAppearance({ ...PALETTE_COLORS[palette], ground: { kind: 'preset', key } }, mode);
        expectReadable(roles, ground.colors, `${palette} on ${key}`);
      }
    }
  });

  it('fits any colour into a readable ground, and keeps one that reads', () => {
    for (const color of colours(160, 7)) {
      const fitted = fitGround(color, mode);
      expect([color, groundReads(fitted, mode)]).toEqual([color, true]);
      if (groundReads(color, mode)) expect(fitted).toBe(color);
    }
  });

  it('derives readable roles from any primary and accent, on any ground', () => {
    const picks = colours(90, 11);
    for (let index = 0; index < picks.length; index += 3) {
      const ground: GroundChoice = { kind: 'color', color: picks[index + 2]! };
      const { roles, ground: paint } = resolveAppearance({ primary: picks[index]!, accent: picks[index + 1]!, ground }, mode);
      expectReadable(roles, paint.colors, picks.slice(index, index + 3).join(' '));
    }
  });

  it('keeps a picked primary and accent exactly when they already hold their ink', () => {
    expect(primaryRoles('#6DBDB3', mode).leaf).toBe('#6DBDB3');
    expect(accentRoles('#2F5D8C', 'light').action).toBe('#2F5D8C');
  });

  it('keeps generated gradients readable, clouds and blends included', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const spec = randomGradient(seed);
      for (const form of ['fondu', 'nuees'] as const) {
        const paint = gradientPaint({ ...spec, form }, mode);
        for (const color of paint.colors) expect([seed, form, color, groundReads(color, mode)]).toEqual([seed, form, color, true]);
      }
    }
  });

  it('keeps gradients of any picked colours readable', () => {
    const picks = colours(48, 3);
    for (let index = 0; index < picks.length; index += 4) {
      const colors = picks.slice(index, index + 2 + (index % 3));
      for (const form of ['fondu', 'nuees'] as const) {
        const paint = gradientPaint({ colors, form, seed: index }, mode);
        for (const color of paint.colors) expect([colors.join(' '), form, color, groundReads(color, mode)]).toEqual([colors.join(' '), form, color, true]);
      }
    }
  });
});

describe('generating', () => {
  it('draws the same gradient from the same seed, in harmony and in range', () => {
    expect(randomGradient(42)).toEqual(randomGradient(42));
    expect(randomGradient(42)).not.toEqual(randomGradient(43));
    for (let seed = 0; seed < 200; seed += 1) {
      const spec = randomGradient(seed);
      expect(spec.colors.length).toBeGreaterThanOrEqual(2);
      expect(spec.colors.length).toBeLessThanOrEqual(4);
      expect(spec.colors.every(isHex)).toBe(true);
      expect(Number.isInteger(spec.seed)).toBe(true);
    }
  });

  it('lays clouds out by their seed: the same seed the same, another elsewhere', () => {
    const spec = { colors: ['#F7EFE6', '#F9D9E6', '#D3EBF2'], form: 'nuees' as const, seed: 5 };
    expect(gradientPaint(spec, 'light')).toEqual(gradientPaint(spec, 'light'));
    expect(gradientPaint({ ...spec, seed: shuffleSeed(5) }, 'light').layers).not.toEqual(gradientPaint(spec, 'light').layers);
    // A cloud per colour over the ground's own, then the ground lighter at the top.
    expect(gradientPaint(spec, 'light').layers).toHaveLength(3);
    expect(gradientPaint(spec, 'light').layers[0]).toMatch(/^radial-gradient\(circle at [\d.]+% [\d.]+%, rgba\(/);
  });

  it('blends a fondu from the top to the foot through every colour', () => {
    const paint = gradientPaint({ colors: ['#F6C1A6', '#C9B6F2'], form: 'fondu', seed: 0 }, 'light');
    expect(paint.layers).toHaveLength(1);
    expect(paint.layers[0]).toMatch(/^linear-gradient\(180deg, #[0-9A-F]{6} 0%, .* 100%\)$/);
    expect(paint.top).toBe(fitGround('#F6C1A6', 'light', 0.3));
  });
});

describe('reading stored settings', () => {
  it('falls back to the default for anything unreadable', () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('nope')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ primary: 'green', accent: 12, ground: { kind: 'preset', key: 'mars' }, grain: 'yes' })).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ ground: { kind: 'gradient', colors: ['#FFFFFF'], form: 'fondu', seed: 1 } }).ground).toEqual(DEFAULT_APPEARANCE.ground);
    expect(parseAppearance({ ground: { kind: 'gradient', colors: ['#FFFFFF', '#000000'], form: 'spiral', seed: 1 } }).ground).toEqual(DEFAULT_APPEARANCE.ground);
  });

  it('keeps what reads, and takes the old grain switch when the ground’s own was never stored', () => {
    const stored: Appearance = {
      primary: '#123456',
      accent: '#ABCDEF',
      ground: { kind: 'gradient', colors: ['#FFEEDD', '#DDEEFF', '#EEDDFF'], form: 'nuees', seed: 9 },
      grain: false,
      ownColor: '#FAFAFA',
      ownGradient: { colors: ['#FFEEDD', '#DDEEFF'], form: 'fondu', seed: 2 },
    };
    expect(parseAppearance(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(parseAppearance({}, false).grain).toBe(false);
    expect(parseAppearance({ grain: true }, false).grain).toBe(true);
  });

  it('tells grounds apart', () => {
    expect(sameGround({ kind: 'preset', key: 'aube' }, { kind: 'preset', key: 'aube' })).toBe(true);
    expect(sameGround({ kind: 'color', color: '#FFFFFF' }, { kind: 'preset', key: 'aube' })).toBe(false);
    const gradient: GroundChoice = { kind: 'gradient', colors: ['#FFFFFF', '#000000'], form: 'fondu', seed: 1 };
    expect(sameGround(gradient, { ...gradient, seed: 2 })).toBe(false);
    expect(sameGround(gradient, { ...gradient, colors: ['#FFFFFF', '#000000'] })).toBe(true);
  });
});

describe('the ground as data', () => {
  it('holds each CSS layer as the gradient it is written from', () => {
    for (const mode of MODES) {
      for (const key of GROUND_PRESETS) {
        const { layers, gradients } = groundPaint({ kind: 'preset', key }, mode);
        expect(gradients.map(gradient => gradient.kind)).toEqual(layers.map(layer => (layer.startsWith('radial-gradient(') ? 'radial' : 'linear')));
      }
    }
  });
});

describe('the mark', () => {
  it('keeps its own colours in Carnet’s primary', () => {
    expect(markColors(PALETTE_COLORS.carnet.primary)).toBe(MARK_COLORS);
  });

  it('keeps its card as far off the pebble as on Carnet’s mark, the primary’s hue kept', () => {
    const least = contrast(MARK_COLORS.card, MARK_COLORS.tile);
    const picked = [...PALETTES.filter(key => key !== 'carnet').map(key => PALETTE_COLORS[key].primary), ...colours(200, 13)];
    for (const primary of picked) {
      const { tile, card } = markColors(primary);
      expect(card).toBe(MARK_COLORS.card);
      expect(contrast(card, tile)).toBeGreaterThanOrEqual(least - 1e-9);
      const [, chroma, hue] = toOklch(primary);
      const [, tileChroma, tileHue] = toOklch(tile);
      // A grey has no hue to keep.
      if (chroma > 0.04 && tileChroma > 0.02) expect(Math.abs(((tileHue - hue + 540) % 360) - 180), primary).toBeLessThan(3);
    }
  });

  it('keeps a primary the card already stands off as it is', () => {
    expect(markColors('#1E3A5F').tile).toBe('#1E3A5F');
  });
});

