import { hexToHsv, hsvToHex, isHex, mixOklab, normalizeHex } from '../color';
import { contrast } from '../palette';

describe('a typed colour', () => {
  it('reads every way a hex code is written', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex('  #a1b2c3 ')).toBe('#A1B2C3');
    expect(normalizeHex('A1B2C3')).toBe('#A1B2C3');
  });

  it('refuses what is not one', () => {
    for (const input of ['', '#', '#ab', 'xyz', '#12345g', '#1234567', 'rgb(1, 2, 3)']) expect([input, normalizeHex(input)]).toEqual([input, null]);
  });

  it('stores capitals only', () => {
    expect(isHex('#A1B2C3')).toBe(true);
    expect(isHex('#a1b2c3')).toBe(false);
    expect(isHex('#ABC')).toBe(false);
    expect(isHex(12)).toBe(false);
  });
});

describe('the picker', () => {
  it('goes from a colour to its point and back', () => {
    for (const hex of ['#9CC15F', '#A75C2A', '#2F5D8C', '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#808080', '#E9C84E']) {
      expect([hex, hsvToHex(hexToHsv(hex))]).toEqual([hex, hex]);
    }
  });

  it('keeps the hue it stood on for a grey', () => {
    expect(hexToHsv('#808080', 210).h).toBe(210);
    expect(hexToHsv('#000000', 42)).toEqual({ h: 42, s: 0, v: 0 });
  });

  it('places the primaries where the strip shows them', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00FF00');
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000FF');
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#FF0000');
  });
});

describe('a blend', () => {
  it('starts and ends on its two colours', () => {
    expect(contrast(mixOklab('#F6C1A6', '#C9B6F2', 0), '#F6C1A6')).toBeLessThan(1.01);
    expect(contrast(mixOklab('#F6C1A6', '#C9B6F2', 1), '#C9B6F2')).toBeLessThan(1.01);
  });
});
