import { DEFAULT_APPEARANCE, markColors, PALETTE_COLORS } from '../appearance';
import { MARK_COLORS, parseHex } from '../palette';
import { SERVICE_PICTURES, servicePicture } from '../servicePictures';
import { decodePng, jpegSize } from './decode';

describe('Seafile’s pictures', () => {
  it('are named and typed as Seafile’s settings take them', async () => {
    const files = await Promise.all(SERVICE_PICTURES.filter(picture => picture !== 'login').map(picture => servicePicture(picture, DEFAULT_APPEARANCE)));
    expect(files.map(file => [file.name, file.mime])).toEqual([
      ['seafile-logo.png', 'image/png'],
      ['seafile-favicon.ico', 'image/x-icon'],
    ]);
  });

  it('draw the mark in the primary: its pebble, its card, the leaf cut through to the pebble, nothing around', async () => {
    const appearance = { ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.pivoine };
    const { width, height, pixels } = decodePng((await servicePicture('logo', appearance)).bytes);
    expect([width, height]).toEqual([256, 256]);
    const { tile, card } = markColors(appearance.primary);
    expect(tile).not.toBe(MARK_COLORS.tile);
    const rgba = (x: number, y: number): number[] => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
    // Over the card's top edge, on the card's lower right, in the leaf, in a corner.
    expect(rgba(128, 22)).toEqual([...parseHex(tile), 255]);
    expect(rgba(166, 184)).toEqual([...parseHex(card), 255]);
    expect(rgba(137, 120)).toEqual([...parseHex(tile), 255]);
    expect(rgba(2, 2)).toEqual([0, 0, 0, 0]);
  });

  it('hold the mark at 16, 32 and 48 in the favicon', async () => {
    const ico = (await servicePicture('favicon', DEFAULT_APPEARANCE)).bytes;
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    const sizes = Array.from({ length: view.getUint16(4, true) }, (_, index) => {
      const entry = 6 + index * 16;
      const offset = view.getUint32(entry + 12, true);
      const { width, height } = decodePng(ico.subarray(offset, offset + view.getUint32(entry + 8, true)));
      return [ico[entry], width, height];
    });
    expect(sizes).toEqual([
      [16, 16, 16],
      [32, 32, 32],
      [48, 48, 48],
    ]);
  });

  it('cover the login page at Seafile’s size, the grain only when the ground has it', async () => {
    let pauses = 0;
    const grainy = await servicePicture('login', DEFAULT_APPEARANCE, async () => {
      pauses += 1;
    });
    const plain = await servicePicture('login', { ...DEFAULT_APPEARANCE, grain: false });
    expect([grainy.name, grainy.mime]).toEqual(['seafile-login-bg.jpg', 'image/jpeg']);
    expect(jpegSize(grainy.bytes)).toEqual([2400, 1600]);
    expect(pauses).toBeGreaterThan(0);
    expect(plain.bytes.length).toBeLessThan(grainy.bytes.length / 4);
  });
});
