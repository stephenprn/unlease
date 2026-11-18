import { setLocale } from '@unlease/core/i18n';
import { watermarkLayout, watermarkText, type WatermarkLayout } from '../watermark';

describe('watermarkText', () => {
  afterEach(() => setLocale('en'));

  it('says whom, what for and when, in French', () => {
    setLocale('fr');
    expect(watermarkText({ recipient: ' Agence  Martin ', purpose: 'dossier de location', date: '2026-11-18' })).toBe('Copie destinée à Agence Martin – dossier de location – 18\u00a0nov.\u00a02026');
    expect(watermarkText({ recipient: 'Agence Martin', date: '2026-11-18' })).toBe('Copie destinée à Agence Martin – 18\u00a0nov.\u00a02026');
    expect(watermarkText({ purpose: 'dossier de location', date: '2026-11-18' })).toBe('Copie – dossier de location – 18\u00a0nov.\u00a02026');
    expect(watermarkText({ recipient: '  ', purpose: '', date: '2026-11-18' })).toBe('Copie – 18\u00a0nov.\u00a02026');
  });

  it('says it in English, and keeps a date that is not a day as typed', () => {
    expect(watermarkText({ recipient: 'Martin & Co', purpose: 'rental application', date: 'Nov 2026' })).toBe('Copy for Martin & Co – rental application – Nov 2026');
  });
});

/** Whether a point lies on some row's band: along it, and within half a row of its baseline. */
function covered(layout: WatermarkLayout, px: number, py: number, charWidth = 0.55): boolean {
  const radians = (layout.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rowGap = 3 * layout.fontSize;
  return layout.lines.some(line => {
    const dx = px - line.x;
    const dy = py - line.y;
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    const length = [...line.text].length * charWidth * layout.fontSize;
    return along >= 0 && along <= length && Math.abs(across) <= rowGap / 2 + 0.01;
  });
}

describe('watermarkLayout', () => {
  const text = 'Copie destinée à Agence Martin – dossier de location – 18\u00a0nov.\u00a02026';

  it.each([
    [1240, 1754, -30],
    [1754, 1240, -30],
    [400, 3000, -45],
    [3000, 200, 20],
    [800, 800, 0],
  ])('covers a %i × %i picture turned %i°, its corners and all between', (width, height, angleDeg) => {
    const layout = watermarkLayout(width, height, text, { angleDeg });
    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ])
      expect(covered(layout, x!, y!)).toBe(true);
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) expect(covered(layout, (width * i) / 10, (height * j) / 10)).toBe(true);
  });

  it('sizes the letters from the diagonal, and spaces rows by them', () => {
    const layout = watermarkLayout(1200, 1600, text);
    expect(layout.fontSize).toBeCloseTo(2000 / 28, 1);
    expect(layout.angle).toBe(-30);
    const [a, b] = layout.lines;
    // Consecutive rows are three font sizes apart across, and shifted along like bricks.
    const radians = (-30 * Math.PI) / 180;
    const across = -(b!.x - a!.x) * Math.sin(radians) + (b!.y - a!.y) * Math.cos(radians);
    expect(across).toBeCloseTo(3 * layout.fontSize, 0);
    const along = (b!.x - a!.x) * Math.cos(radians) + (b!.y - a!.y) * Math.sin(radians);
    expect(Math.abs(along)).toBeGreaterThan(layout.fontSize);
  });

  it('gives the same rows for the same picture', () => {
    expect(watermarkLayout(1000, 700, text, { fontSize: 30 })).toEqual(watermarkLayout(1000, 700, text, { fontSize: 30 }));
    const layout = watermarkLayout(1000, 700, text, { fontSize: 30 });
    for (const line of layout.lines) {
      expect(line.x).toBe(Math.round(line.x * 100) / 100);
      expect(line.text.startsWith(text)).toBe(true);
    }
  });
});
