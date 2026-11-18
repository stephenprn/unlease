/**
 * A copy to send, watermarked as France's « Filigrane Facile » does: each picture of a paper drawn
 * again with « Copie destinée à … – … – date » across it in diagonal rows (`services/watermark`), the
 * words drawn into the pixels (no layer to take off), then one PDF of the pages (`services/pdf`). Made
 * in this browser from the opened pictures; nothing of it is kept.
 */
import { pdfFromJpegs } from '@unlease/wallet/services/pdf';
import { watermarkLayout } from '@unlease/wallet/services/watermark';

async function watermarked(source: Blob, text: string): Promise<{ readonly bytes: Uint8Array; readonly width: number; readonly height: number }> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const layout = watermarkLayout(canvas.width, canvas.height, text);
  context.font = `600 ${layout.fontSize}px Signika, system-ui, sans-serif`;
  context.fillStyle = 'rgba(26, 24, 23, 0.34)';
  context.textBaseline = 'alphabetic';
  for (const line of layout.lines) {
    context.save();
    context.translate(line.x, line.y);
    context.rotate((layout.angle * Math.PI) / 180);
    context.fillText(line.text, 0, 0);
    context.restore();
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('no picture');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

/** The pages watermarked, as one PDF. */
export async function watermarkedPdf(pages: readonly Blob[], text: string, title: string): Promise<Uint8Array> {
  const drawn = [];
  for (const page of pages) drawn.push(await watermarked(page, text));
  return pdfFromJpegs(drawn, { title });
}
