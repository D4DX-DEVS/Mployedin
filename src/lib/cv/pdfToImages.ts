/**
 * Render a PDF to page images.
 *
 * Why: some vision models on OpenRouter (qwen/qwen3.7-flash among them) take
 * images but not PDFs, so a CV has to be rasterised before it can be read.
 * Uses pdf-parse's own `getScreenshot` (pdfjs + @napi-rs/canvas), both already
 * installed - no new dependency.
 */

import { PDFParse } from "pdf-parse";

export interface PdfPageImage {
  pageNumber: number;
  /** PNG bytes. */
  png: Uint8Array;
  /** `data:image/png;base64,...` - ready for an OpenAI-style `image_url` part. */
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfToImagesOptions {
  /** Target width in px; height follows the page ratio. 1400 keeps small CV print legible. */
  desiredWidth?: number;
  /** Render at most this many pages (CVs are short; guards runaway files). */
  maxPages?: number;
}

const DEFAULT_WIDTH = 1400;
const DEFAULT_MAX_PAGES = 6;

export async function pdfToImages(
  pdf: Buffer | Uint8Array,
  { desiredWidth = DEFAULT_WIDTH, maxPages = DEFAULT_MAX_PAGES }: PdfToImagesOptions = {}
): Promise<{ pages: PdfPageImage[]; totalPages: number }> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const res = await parser.getScreenshot({
      first: maxPages,
      desiredWidth,
      imageBuffer: true,
      imageDataUrl: true,
    });
    return {
      totalPages: res.total,
      pages: res.pages.map((p) => ({
        pageNumber: p.pageNumber,
        png: p.data,
        dataUrl: p.dataUrl,
        width: p.width,
        height: p.height,
      })),
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
