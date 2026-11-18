import sharp from 'sharp';
import { jpegSize, pdfFromJpegs, pdfString } from '../pdf';

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

async function jpeg(width: number, height: number, grey = false, progressive = false): Promise<Uint8Array> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });
  return new Uint8Array(await (grey ? image.toColourspace('b-w') : image).jpeg({ progressive, quality: 80 }).toBuffer());
}

/** Every object the xref table points at, checked against the bytes. */
function checkXref(pdf: Uint8Array): { objects: number; trailer: string } {
  const text = latin1(pdf);
  expect(text.startsWith('%PDF-1.4\n')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
  expect(text.slice(startxref, startxref + 5)).toBe('xref\n');
  const head = /^xref\n0 (\d+)\n/.exec(text.slice(startxref))!;
  const size = Number(head[1]);
  const table = text.slice(startxref + head[0].length, startxref + head[0].length + size * 20);
  expect(table.slice(0, 20)).toBe('0000000000 65535 f \n');
  for (let id = 1; id < size; id++) {
    const entry = table.slice(id * 20, id * 20 + 20);
    expect(entry).toMatch(/^\d{10} 00000 n \n$/);
    const offset = Number(entry.slice(0, 10));
    expect(text.slice(offset, offset + `${id} 0 obj`.length)).toBe(`${id} 0 obj`);
  }
  const trailer = text.slice(text.indexOf('trailer', startxref));
  expect(trailer).toContain(`/Size ${size}`);
  return { objects: size - 1, trailer };
}

describe('jpegSize', () => {
  it('reads a baseline JPEG, a grey one and a progressive one', async () => {
    expect(jpegSize(await jpeg(37, 21))).toEqual({ width: 37, height: 21, components: 3 });
    expect(jpegSize(await jpeg(10, 64, true))).toEqual({ width: 10, height: 64, components: 1 });
    expect(jpegSize(await jpeg(300, 200, false, true))).toEqual({ width: 300, height: 200, components: 3 });
  });

  it('refuses what is not a JPEG, or is cut short', async () => {
    expect(jpegSize(new Uint8Array(0))).toBeNull();
    expect(jpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    const whole = await jpeg(20, 20);
    expect(jpegSize(whole.slice(0, 30))).toBeNull();
  });
});

describe('pdfFromJpegs', () => {
  it('writes a PDF whose cross-reference table points at each object', async () => {
    const portrait = await jpeg(60, 90);
    const landscape = await jpeg(120, 40, true);
    const pdf = pdfFromJpegs(
      [
        { bytes: portrait, width: 60, height: 90 },
        { bytes: landscape, width: 120, height: 40, components: 1 },
      ],
      { title: 'Avis (2026) \\ impôts' },
    );
    const { objects, trailer } = checkXref(pdf);
    expect(objects).toBe(2 + 2 * 3 + 1);
    expect(trailer).toContain('/Root 1 0 R');
    expect(trailer).toContain(`/Info ${objects} 0 R`);
    const text = latin1(pdf);
    expect(text).toContain('/Count 2');
    // A4 portrait, then landscape, each image fitted and centred.
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('q 561.26 0 0 841.89 17.01 0 cm /Im0 Do Q');
    expect(text).toContain('/Width 120 /Height 40 /ColorSpace /DeviceGray');
    expect(text).toContain('/Width 60 /Height 90 /ColorSpace /DeviceRGB');
    expect(text).not.toContain('/Producer');
    // The JPEG goes in whole, byte for byte.
    expect(Buffer.from(pdf).indexOf(Buffer.from(portrait))).toBeGreaterThan(0);
    expect(text).toContain(`/Length ${portrait.length} >>\nstream\n`);
  });

  it('pages a fitted document by the image, its long side 842 points, and writes no Info without a title', async () => {
    const pdf = pdfFromJpegs([{ bytes: await jpeg(100, 50), width: 100, height: 50 }], { pageSize: 'fit' });
    const { objects, trailer } = checkXref(pdf);
    expect(objects).toBe(5);
    expect(trailer).not.toContain('/Info');
    expect(latin1(pdf)).toContain('/MediaBox [0 0 842 421]');
  });

  it('writes a title as PDF reads it', () => {
    expect(pdfString('Avis (2026) \\ x')).toBe('(Avis \\(2026\\) \\\\ x)');
    expect(pdfString('a\nb')).toBe('(a\\nb)');
    expect(pdfString('Été')).toBe('<FEFF00C9007400E9>');
    expect(pdfString('🪪')).toBe('<FEFFD83EDEAA>');
  });

  it('refuses no page, and a page that is not a grey or colour JPEG', () => {
    expect(() => pdfFromJpegs([])).toThrow();
    expect(() => pdfFromJpegs([{ bytes: new Uint8Array(4), width: 0, height: 0 }])).toThrow();
  });
});
