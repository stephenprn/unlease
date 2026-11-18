/** A QR code as SVG, drawn by the same bwip-js the barcodes are (loaded when first asked). */
import { barcodeSvg } from '../Barcode';

export const barcodeQr = (text: string): Promise<string | null> => barcodeSvg('qr', text);
