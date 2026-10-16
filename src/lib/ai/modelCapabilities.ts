/**
 * What a model on OpenRouter can take as input.
 *
 * Only Gemini reads a PDF itself. Every other model gets a PDF as page images
 * (see `pdfPartsToImages`). OpenRouter's alternative, its file-parser plugin,
 * falls back to Mistral OCR at $2 per 1,000 pages for a model with no native
 * PDF input, and nobody would notice until the invoice.
 */
export function modelReadsPdf(openRouterModelId: string): boolean {
  return openRouterModelId.startsWith("google/");
}
