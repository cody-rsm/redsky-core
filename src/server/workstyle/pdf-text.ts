import 'server-only';
import { extractText } from 'unpdf';

export type PdfText = { text: string; pageCount: number };

// Text-layer extraction only. Scanned (image-only) PDFs yield little or no text; RedSky reports that honestly
// instead of claiming to have read them, because OCR is not configured.
export async function extractPdfText(bytes: Buffer): Promise<PdfText> {
  const { text, totalPages } = await extractText(new Uint8Array(bytes), { mergePages: true });
  return { text, pageCount: totalPages };
}

export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.length > 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
}
