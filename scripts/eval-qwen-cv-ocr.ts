/**
 * Evaluate PDF -> image -> Qwen OCR on a set of CVs.
 *
 * Ground truth is each PDF's own text layer (pdf-parse getText). A PDF with no
 * text layer (scanned) has no ground truth: it is OCR'd but only reported by size.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/eval-qwen-cv-ocr.ts <outDir> <pdf...>
 *
 * The model is whatever OPENROUTER_TEXT_MODEL resolves to; set it to compare
 * models. One call per PDF (qwen3.7-flash ~$0.0004 per CV). Token counts per
 * call appear in the usage log line.
 */

import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { pdfToImages } from "@/lib/cv/pdfToImages";
import { ocrDocument } from "@/lib/ai/visionOcr";

const norm = (s: string) => s.toLowerCase().normalize("NFKC");
const words = (s: string) => norm(s).match(/[\p{L}\p{N}]+/gu) ?? [];

function multiset(ws: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of ws) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

/** Share of `ref` words (multiset) also present in `hyp`. */
function overlap(ref: string[], hyp: string[]): number {
  if (!ref.length) return NaN;
  const h = multiset(hyp);
  let hit = 0;
  for (const w of ref) {
    const n = h.get(w) ?? 0;
    if (n > 0) {
      hit++;
      h.set(w, n - 1);
    }
  }
  return hit / ref.length;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /(?:https?:\/\/|www\.|linkedin\.com|github\.com)[^\s)>,]+/gi;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const YEAR = /\b(?:19|20)\d{2}\b/g;

function fieldRecall(ref: string, hyp: string, re: RegExp, squash = false) {
  const clean = (s: string) => (squash ? s.replace(/[^\d+]/g, "") : norm(s).replace(/[\s.,;]+$/g, ""));
  const refVals = [...new Set((ref.match(re) ?? []).map(clean))];
  const hypBlob = squash ? hyp.replace(/[^\d+]/g, "") : norm(hyp);
  const found = refVals.filter((v) => hypBlob.includes(v));
  return { total: refVals.length, found: found.length, missed: refVals.filter((v) => !found.includes(v)) };
}

async function textLayer(buf: Buffer): Promise<string> {
  const p = new PDFParse({ data: new Uint8Array(buf) });
  try {
    return ((await p.getText()).text ?? "").trim();
  } finally {
    await p.destroy().catch(() => undefined);
  }
}

async function main() {
  const [outDir, ...pdfs] = process.argv.slice(2);
  if (!outDir || !pdfs.length) throw new Error("usage: <outDir> <pdf...>");
  fs.mkdirSync(outDir, { recursive: true });

  const rows: Record<string, unknown>[] = [];
  for (const file of pdfs) {
    const name = path.basename(file, ".pdf");
    const slug = name.replace(/\W+/g, "_");
    const row: Record<string, unknown> = { name };
    try {
      const buf = fs.readFileSync(file);
      const truth = await textLayer(buf);
      const { pages, totalPages } = await pdfToImages(buf);
      pages.forEach((p) => fs.writeFileSync(path.join(outDir, `${slug}_p${p.pageNumber}.png`), p.png));
      const started = Date.now();
      const ocrText = await ocrDocument(buf, "application/pdf");
      fs.writeFileSync(path.join(outDir, `${slug}.ocr.txt`), ocrText);
      fs.writeFileSync(path.join(outDir, `${slug}.truth.txt`), truth);

      const ref = words(truth);
      const hyp = words(ocrText);
      row.pages = `${pages.length}/${totalPages}`;
      row.truthWords = ref.length;
      row.ocrWords = hyp.length;
      row.recall = ref.length >= 30 ? overlap(ref, hyp) : null;
      row.precision = ref.length >= 30 ? overlap(hyp, ref) : null;
      row.email = fieldRecall(truth, ocrText, EMAIL);
      row.phone = fieldRecall(truth, ocrText, PHONE, true);
      row.url = fieldRecall(truth, ocrText, URL_RE);
      row.year = fieldRecall(truth, ocrText, YEAR);
      row.sec = +((Date.now() - started) / 1000).toFixed(1);
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
