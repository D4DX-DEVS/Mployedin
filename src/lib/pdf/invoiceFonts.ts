import fs from "fs";
import path from "path";
import type { jsPDF } from "jspdf";

/**
 * Fonts for jsPDF documents (invoices).
 *
 * jsPDF's built-in Helvetica has no Arabic glyphs, so an Arabic company name
 * or address printed as mojibake. Latin text uses Inter (already shipped for
 * CVs); any string containing Arabic switches to Noto Sans Arabic — the same
 * face the website uses — and jsPDF's arabic plugin shapes the letters.
 *
 * Files are read once per process. A missing file falls back to Helvetica
 * rather than failing the download.
 */

export const LATIN_FONT = "Inter";
export const ARABIC_FONT = "NotoSansArabic";

type FontFile = { family: string; style: "normal" | "bold"; file: string };

const FONT_FILES: FontFile[] = [
  { family: LATIN_FONT, style: "normal", file: "fonts/cv/inter-400-normal.ttf" },
  { family: LATIN_FONT, style: "bold", file: "fonts/cv/inter-700-normal.ttf" },
  { family: ARABIC_FONT, style: "normal", file: "fonts/invoice/NotoSansArabic-Regular.ttf" },
  { family: ARABIC_FONT, style: "bold", file: "fonts/invoice/NotoSansArabic-Bold.ttf" },
];

const cache = new Map<string, string | null>();

function readBase64(file: string): string | null {
  if (cache.has(file)) return cache.get(file) ?? null;
  let data: string | null = null;
  try {
    data = fs.readFileSync(path.join(process.cwd(), "public", file)).toString("base64");
  } catch {
    data = null;
  }
  cache.set(file, data);
  return data;
}

export type RegisteredFonts = { latin: string; arabic: string | null };

/** Register the invoice fonts on a document. Returns the families that loaded. */
export function registerInvoiceFonts(doc: jsPDF): RegisteredFonts {
  const loaded = new Set<string>();
  for (const f of FONT_FILES) {
    const data = readBase64(f.file);
    if (!data) continue;
    const vfsName = path.basename(f.file);
    doc.addFileToVFS(vfsName, data);
    doc.addFont(vfsName, f.family, f.style);
    loaded.add(`${f.family}:${f.style}`);
  }
  const has = (family: string) => loaded.has(`${family}:normal`) && loaded.has(`${family}:bold`);
  return {
    latin: has(LATIN_FONT) ? LATIN_FONT : "helvetica",
    arabic: has(ARABIC_FONT) ? ARABIC_FONT : null,
  };
}

// Arabic, Arabic Supplement, Extended-A and both presentation-form blocks.
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/;

export function hasArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}
