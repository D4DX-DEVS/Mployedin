/**
 * Getting a document in front of a vision model that cannot read PDFs.
 *
 * qwen/qwen3.7-flash takes images, not PDFs, so each PDF part becomes one PNG
 * per page. Measured 2026-10-15 on 10 real CVs: Qwen transcribed 99.90% of the
 * words from 1400 px page images (Gemini, reading the PDF itself: 99.97%).
 */

import type { NativePart } from "@/lib/ai/googleAI";

const PDF_MIME = "application/pdf";

/** Qwen took 6-65 s per CV (about 33 s on average) on 2026-10-15; the default budget is 20 s. */
export function visionTimeoutMs(images: number): number {
  return Math.min(150_000, 30_000 + 20_000 * images);
}

/** Replace every PDF part with its pages as PNG parts. Other parts pass through unchanged. */
export async function pdfPartsToImages(parts: readonly NativePart[]): Promise<NativePart[]> {
  if (!parts.some((part) => part.inlineData?.mimeType === PDF_MIME)) return [...parts];
  // Loaded on demand: pdf.js and its canvas binary are heavy, and most calls never need them.
  const { pdfToImages } = await import("@/lib/cv/pdfToImages");
  const out: NativePart[] = [];
  for (const part of parts) {
    if (part.inlineData?.mimeType !== PDF_MIME) {
      out.push(part);
      continue;
    }
    // ponytail: pdfToImages renders the first 6 pages only; a longer scanned document loses its tail.
    const { pages } = await pdfToImages(Buffer.from(part.inlineData.data, "base64"));
    if (pages.length === 0) throw new Error("The PDF has no pages to read");
    for (const page of pages) {
      out.push({ inlineData: { mimeType: "image/png", data: Buffer.from(page.png).toString("base64") } });
    }
  }
  return out;
}
