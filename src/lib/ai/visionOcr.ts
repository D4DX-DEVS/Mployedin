/**
 * Transcribe a scanned document: a CV with no text layer, or a photo of one.
 *
 * Transcription only. Turning the text into profile fields is a second,
 * text-only call (CV_PARSE_PROMPT), so the transcription can be stored as the
 * ATS's evidence and parsed again later without paying to read the scan twice.
 * A PDF reaches a model that cannot read PDFs as page images (generateMultimodal).
 */

import { generateMultimodal, GEMINI_MODELS } from "@/lib/ai/gemini";

export const OCR_PROMPT = [
  "Transcribe this CV/resume exactly as written, in reading order, page by page.",
  "Rules: copy every word, number, date, email, phone, URL and link verbatim.",
  "Keep headings, bullet points and line breaks. Do not summarise, translate, correct or add anything.",
  "Include text in headers, footers, sidebars and tables. If something is unreadable write [illegible].",
  "Output only the transcription.",
].join("\n");

/** A 2-page CV transcribed to 2-4k tokens in the 2026-10-15 test; this leaves room for longer ones. */
export const OCR_MAX_TOKENS = 8000;

/**
 * The model answered, but with no text: a blank page, or a scan too faint to
 * read. Callers tell the seeker to try a clearer file instead of parsing
 * nothing. Provider and network errors are not this; they pass through as is.
 */
export class EmptyOcrError extends Error {
  constructor(message = "The model returned no text for this document") {
    super(message);
    this.name = "EmptyOcrError";
  }
}

/** Returns the trimmed transcription; throws EmptyOcrError when there is none. */
export async function ocrDocument(file: Buffer, mimeType: string): Promise<string> {
  const text = await generateMultimodal(
    [{ text: OCR_PROMPT }, { inlineData: { mimeType, data: file.toString("base64") } }],
    GEMINI_MODELS.flash,
    OCR_MAX_TOKENS
  );
  const transcription = text.trim();
  if (!transcription) throw new EmptyOcrError();
  return transcription;
}
