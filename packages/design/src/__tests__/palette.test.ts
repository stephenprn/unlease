import { LINE_COLORS, NOTE_GRADIENTS } from '../colors';
import { gradientColors } from '../backgrounds';
import { contrast, GROUNDS, LINES, ROLES, type Mode } from '../palette';

/** WCAG AA in both modes: 4.5:1 for text, 3:1 for large text, glyphs and control edges. */
describe.each<Mode>(['light', 'dark'])('%s palette', mode => {
  const r = ROLES[mode];

  it('keeps every ink readable on the paper it is written on', () => {
    for (const ground of [r.wall, r.paper, r.paperHigh, r.field]) {
      expect(contrast(r.ink, ground)).toBeGreaterThanOrEqual(7);
      expect(contrast(r.inkMuted, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(r.inkFaint, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(r.link, ground)).toBeGreaterThanOrEqual(4.5);
      // A filled button and a focus edge are shapes: they hold 3:1 against what they sit on.
      expect(contrast(r.action, ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(r.focus, ground)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(r.onSlip, r.slip)).toBeGreaterThanOrEqual(7);
    expect(contrast(r.onSlipMuted, r.slip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.onSlip, r.slipHigh)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.slipAction, r.slip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.onAction, r.action)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.onActionContainer, r.actionContainer)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.onLeaf, r.leaf)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.onDanger, r.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.danger, r.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.ink, r.highlight)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps ink readable on every washed sheet, and a pigment visible on the ground', () => {
    for (const color of LINE_COLORS) {
      const swatch = LINES[mode][color];
      // The tick on a chosen swatch is a glyph: 3:1.
      expect([color, contrast(swatch.on, swatch.fill) >= 3]).toEqual([color, true]);
      expect([color, contrast(swatch.fill, r.wall) >= 3]).toEqual([color, true]);
      expect([color, contrast(r.ink, swatch.tint) >= 7]).toEqual([color, true]);
      expect([color, contrast(r.inkMuted, swatch.tint) >= 4.5]).toEqual([color, true]);
    }
  });

  it('keeps a page’s coloured words readable on every paper, well and wash', () => {
    const grounds = [r.wall, r.paper, r.field, r.paperHigh, ...LINE_COLORS.map(other => LINES[mode][other].tint)];
    for (const color of LINE_COLORS) {
      for (const ground of grounds) expect([color, ground, contrast(LINES[mode][color].text, ground) >= 4.5]).toEqual([color, ground, true]);
    }
  });

  it('keeps ink readable on every colour a gradient shows', () => {
    for (const gradient of NOTE_GRADIENTS) {
      for (const color of gradientColors(mode, gradient)) {
        expect([gradient, color, contrast(r.ink, color) >= 7]).toEqual([gradient, color, true]);
        expect([gradient, color, contrast(r.inkMuted, color) >= 4.5]).toEqual([gradient, color, true]);
      }
    }
  });

  it('draws a control edge at 3:1 on every ground', () => {
    for (const ground of [r.wall, r.paper, r.field, r.paperHigh]) expect(contrast(r.edge, ground)).toBeGreaterThanOrEqual(3);
  });

  it('keeps every ink, edge and pigment of the wall readable on both tones of the ground', () => {
    for (const ground of [GROUNDS[mode].top, GROUNDS[mode].bottom]) {
      expect([ground, contrast(r.ink, ground) >= 7]).toEqual([ground, true]);
      expect([ground, contrast(r.inkMuted, ground) >= 4.5]).toEqual([ground, true]);
      expect([ground, contrast(r.link, ground) >= 4.5]).toEqual([ground, true]);
      expect([ground, contrast(r.action, ground) >= 3]).toEqual([ground, true]);
      expect([ground, contrast(r.focus, ground) >= 3]).toEqual([ground, true]);
      expect([ground, contrast(r.edge, ground) >= 3]).toEqual([ground, true]);
      for (const color of LINE_COLORS) expect([ground, color, contrast(LINES[mode][color].fill, ground) >= 3]).toEqual([ground, color, true]);
    }
  });

  it('keeps an image well visible where the ground meets it', () => {
    // By day the foot of the ground comes close to the well; a well there keeps its outline edge.
    const tone = mode === 'light' ? GROUNDS.light.top : GROUNDS.dark.top;
    expect(contrast(r.paperHigh, tone)).toBeGreaterThanOrEqual(1.15);
  });

  it('keeps an image well visible on the ground and on a card', () => {
    expect(contrast(r.paperHigh, r.wall)).toBeGreaterThanOrEqual(1.15);
    expect(contrast(r.paperHigh, r.paper)).toBeGreaterThanOrEqual(1.1);
  });

  it('keeps a disabled button readable: the second ink in a well', () => {
    expect(contrast(r.inkMuted, r.paperHigh)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the sync dots visible on the search strip', () => {
    expect(contrast(r.ok, r.paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(r.waiting, r.paper)).toBeGreaterThanOrEqual(3);
  });
});
