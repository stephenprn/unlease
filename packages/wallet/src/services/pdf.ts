/**
 * A scanned document's pages as one PDF: a small PDF 1.4 writer that places JPEG pages as they are
 * (`/DCTDecode`: the JPEG's bytes go in whole, nothing is decoded or compressed again). Both clients
 * hand it the pages they encoded themselves, so the JPEGs carry no orientation of their own (EXIF's
 * is not read: a PDF viewer would not read it either).
 *
 * The file names nothing but its title: no producer, no creator, no dates.
 */
import { concatBytes, utf8 } from '../crypto/bytes';

export interface JpegSize {
  readonly width: number;
  readonly height: number;
  /** 1 (grey), 3 (colour), 4 (CMYK). */
  readonly components: number;
}

/**
 * A JPEG's size and components, read from its frame header (SOF0 baseline, SOF1 extended, SOF2
 * progressive: what a PDF reader's DCT decoder takes). null when it is not such a JPEG.
 */
export function jpegSize(bytes: Uint8Array): JpegSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    // Fill bytes: any number of 0xFF before a marker.
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === undefined) return null;
    // Markers without a length: restarts, TEM, a second SOI.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xd8) continue;
    // The scan or the end before any frame header.
    if (marker === 0xda || marker === 0xd9) return null;
    if (at + 2 > bytes.length) return null;
    const length = (bytes[at]! << 8) | bytes[at + 1]!;
    if (length < 2 || at + length > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 8) return null;
      const height = (bytes[at + 3]! << 8) | bytes[at + 4]!;
      const width = (bytes[at + 5]! << 8) | bytes[at + 6]!;
      const components = bytes[at + 7]!;
      return width > 0 && height > 0 && components > 0 ? { width, height, components } : null;
    }
    // Any other frame (lossless, hierarchical, arithmetic): not one a PDF reader decodes.
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return null;
    at += length;
  }
  return null;
}

export interface PdfPage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly components?: 1 | 3;
}

export interface PdfOptions {
  readonly title?: string;
  /** `a4` (the default): each page A4, portrait or landscape as the image is; `fit`: each page the image's shape, its long side 842 points (A4's). */
  readonly pageSize?: 'fit' | 'a4';
}

/** A4 in points. */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
/** The long side of a `fit` page. */
const FIT_LONG = 842;

/** A number as PDF writes it: no exponent, at most three decimals. */
function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return (Object.is(rounded, -0) ? 0 : rounded).toString();
}

/** A string as PDF reads it: printable ASCII as a literal, escaped; anything else as UTF-16BE behind its byte order mark. */
export function pdfString(text: string): string {
  if (/^[\x20-\x7e\t\n\r\f\b]*$/.test(text)) {
    const escaped = text.replace(/[\\()]/g, char => `\\${char}`).replace(/[\t\n\r\f\b]/g, char => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r', '\f': '\\f', '\b': '\\b' })[char]!);
    return `(${escaped})`;
  }
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `<${hex}>`;
}

interface Placed {
  readonly image: JpegSize;
  readonly bytes: Uint8Array;
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** The image's box on the page, from its lower left corner. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function place(page: PdfPage, pageSize: 'fit' | 'a4'): Placed {
  // The JPEG's own header is the truth; the size handed in only stands in when it cannot be read.
  const read = jpegSize(page.bytes);
  const image = read ?? { width: page.width, height: page.height, components: page.components ?? 3 };
  if (!(image.width > 0 && image.height > 0)) throw new Error('A page has no size');
  if (image.components !== 1 && image.components !== 3) throw new Error('A page is neither grey nor colour (RGB)');
  if (pageSize === 'fit') {
    const scale = FIT_LONG / Math.max(image.width, image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    return { image, bytes: page.bytes, pageWidth: w, pageHeight: h, x: 0, y: 0, w, h };
  }
  const landscape = image.width > image.height;
  const pageWidth = landscape ? A4_LONG : A4_SHORT;
  const pageHeight = landscape ? A4_SHORT : A4_LONG;
  const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return { image, bytes: page.bytes, pageWidth, pageHeight, x: (pageWidth - w) / 2, y: (pageHeight - h) / 2, w, h };
}

/** JPEG pages as one PDF 1.4, a page each, in order. Throws on no page, or a page that is not a grey or colour JPEG. */
export function pdfFromJpegs(pages: readonly PdfPage[], options: PdfOptions = {}): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs a page');
  const placed = pages.map(page => place(page, options.pageSize ?? 'a4'));

  // Objects: 1 the catalogue, 2 the page tree, then three per page (the page, its contents, its image), then the title's.
  const pageObject = (index: number): number => 3 + index * 3;
  const infoObject = options.title ? 3 + placed.length * 3 : null;
  const count = infoObject ?? 2 + placed.length * 3;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = new Array<number>(count + 1).fill(0);
  let length = 0;
  const write = (part: string | Uint8Array): void => {
    const bytes = typeof part === 'string' ? utf8(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string): void => {
    offsets[id] = length;
    write(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id: number, dictionary: string, data: Uint8Array): void => {
    offsets[id] = length;
    write(`${id} 0 obj\n<< ${dictionary} /Length ${data.length} >>\nstream\n`);
    write(data);
    write('\nendstream\nendobj\n');
  };

  // The binary comment tells a transfer the file is not text.
  write('%PDF-1.4\n');
  write(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${placed.map((_, index) => `${pageObject(index)} 0 R`).join(' ')}] /Count ${placed.length} >>`);
  placed.forEach((page, index) => {
    const id = pageObject(index);
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.pageWidth)} ${num(page.pageHeight)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    );
    stream(id + 1, '', utf8(`q ${num(page.w)} 0 0 ${num(page.h)} ${num(page.x)} ${num(page.y)} cm /Im0 Do Q`));
    const space = page.image.components === 1 ? '/DeviceGray' : '/DeviceRGB';
    stream(id + 2, `/Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode`, page.bytes);
  });
  if (infoObject !== null) object(infoObject, `<< /Title ${pdfString(options.title!)} >>`);

  const xref = length;
  // Each entry exactly 20 bytes: ten digits, five, a letter, a space and a line feed.
  write(`xref\n0 ${count + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= count; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${count + 1} /Root 1 0 R${infoObject !== null ? ` /Info ${infoObject} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`);
  return concatBytes(...chunks);
}
