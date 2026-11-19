/** Clock's wave: drawn by a hand, yet where it says. */
import { brushRing, dayBrush, dayShare, dayWave, dayWaveY, halftone, organicRadius, organicRing, ringPoint, smoothPath, waveBand } from '../waves';

const numbers = (path: string): number[] => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('the wave', () => {
  const ring = { cx: 100, cy: 100, radius: 80, amplitude: 0, waves: 8, phase: 0, seed: 1 };

  it('draws a flat ring as a pebble: near its circle, never quite one', () => {
    const radii = Array.from({ length: 36 }, (_, index) => organicRadius(ring, (index / 36) * Math.PI * 2));
    for (const r of radii) expect(Math.abs(r - 80)).toBeLessThan(80 * 0.03);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1);
    expect(organicRing(ring).endsWith('Z')).toBe(true);
  });

  it('swells by about its amplitude, and two seeds never match', () => {
    const wavy = { ...ring, amplitude: 5 };
    const radii = Array.from({ length: 360 }, (_, index) => organicRadius(wavy, (index / 360) * Math.PI * 2) - 80);
    expect(Math.max(...radii)).toBeGreaterThan(4);
    expect(Math.max(...radii)).toBeLessThan(5 * 1.4 + 3);
    expect(organicRing({ ...wavy, seed: 2 })).not.toBe(organicRing(wavy));
  });

  it('lays a brush arc whose tip is the ring’s point there, and nothing for nothing', () => {
    expect(brushRing(ring, 8, 0, 0)).toBe('');
    const arc = brushRing(ring, 8, 0, 0.25);
    expect(arc.endsWith('Z')).toBe(true);
    const tip = ringPoint(ring, 0.25);
    expect(tip.x).toBeGreaterThan(170);
    expect(Math.abs(tip.y - 100)).toBeLessThan(4);
  });

  it('joins points softly', () => {
    expect(smoothPath([0, 10, 20], [0, 10, 0])).toBe('M0 0Q10 10 15 5L20 0');
    expect(smoothPath([0, 10, 20], [0, 10, 0], false, 'L').startsWith('L0 0')).toBe(true);
  });

  it('fills a band down to its foot, past both sides', () => {
    const path = waveBand({ width: 200, height: 100, baseline: 60, amplitude: 6, wavelength: 80, phase: 0 });
    expect(path.endsWith('L208 100L-8 100Z')).toBe(true);
    const ys = numbers(path).filter((_, index) => index % 2 === 1).slice(0, -2);
    for (const y of ys) expect(Math.abs(y - 60)).toBeLessThan(6 * 1.6);
  });

  it('crosses the horizon at 6:00 and 18:00 whatever its mood, noon high and midnight low', () => {
    for (const breath of [0, 1, 2.5]) {
      expect(dayWaveY(0.25, 50, 30, breath)).toBeCloseTo(50);
      expect(dayWaveY(0.75, 50, 30, breath)).toBeCloseTo(50);
      expect(dayWaveY(0.5, 50, 30, breath)).toBeLessThan(30);
      expect(dayWaveY(0, 50, 30, breath)).toBeGreaterThan(70);
    }
    expect(dayShare('2026-11-19T18:00')).toBeCloseTo(0.75);
    expect(dayWave(240, 50, 30).startsWith('M0 ')).toBe(true);
    expect(dayBrush(240, 50, 30, 4, 0.25, 0.75).endsWith('Z')).toBe(true);
  });
});

describe('the halftone', () => {
  it('draws a dot where the shade asks, none where it does not', () => {
    const none = halftone(40, 40, 10, 0, () => 0);
    expect(none).toBe('');
    const some = halftone(40, 40, 10, 0, x => (x < 20 ? 1 : 0));
    expect(some.match(/M/g)?.length).toBeGreaterThan(4);
    expect(some).toContain('a5 5 0 1 0 10 0');
  });
});
