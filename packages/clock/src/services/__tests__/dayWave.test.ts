/** The day wave: each city at its hour, names lifted where they would touch. */
import { placeMarks, waveMarks, type WaveMark } from '../dayWave';

const geometry = { width: 360, middle: 90, amplitude: 36, line: 16, charWidth: 7 };
const mark = (key: string, share: number, here = false): WaveMark => ({ key, name: key, share, light: 'day', here });

describe('the day wave', () => {
  it('puts each city at the hour it is there, here first', () => {
    const at = Date.UTC(2026, 10, 19, 12, 0);
    const marks = waveMarks([{ id: 'tokyo', zone: 'Asia/Tokyo', name: 'Tokyo', lat: 35.68, lon: 139.69 }], at, 'Europe/Paris');
    expect(marks[0]).toMatchObject({ key: 'here', here: true });
    expect(marks[1]).toMatchObject({ key: 'tokyo', share: 21 / 24, light: 'night' });
  });

  it('lifts a name a row where it would touch another, and keeps names inside the wave', () => {
    const placed = placeMarks([mark('Paris', 0.5, true), mark('Lagos', 0.5), mark('Auckland', 0.98)], geometry);
    const paris = placed.find(item => item.key === 'Paris')!;
    const lagos = placed.find(item => item.key === 'Lagos')!;
    expect(paris.y).toBeLessThan(90 - 30);
    expect(lagos.labelTop).toBeLessThan(paris.labelTop - 15);
    const auckland = placed.find(item => item.key === 'Auckland')!;
    expect(auckland.labelX + auckland.labelWidth / 2).toBeLessThanOrEqual(360);
  });
});
