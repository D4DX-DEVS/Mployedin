/**
 * ATS (Applicant Tracking System) friendliness analyzer.
 *
 * This mirrors how real ATS software (Workday, Greenhouse, Taleo, iCIMS, Lever)
 * and resume checkers (Jobscan, Resume Worded) evaluate a CV: they extract the
 * document's *text layer* with a plain parser and score how cleanly it can be
 * read. The analysis here is therefore **deterministic** (no LLM) — the same CV
 * always produces the same score, which is exactly what an ATS does.
 *
 * The single biggest ATS failure is a scanned / image-only PDF (no text layer) —
 * an ATS reads nothing from it. We detect that and every other common pitfall:
 * non-standard headings, missing contact info, multi-column / table layouts,
 * and broken character encoding.
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import logger from "@/lib/logger";

export type AtsCheckStatus = "pass" | "warn" | "fail";

export interface AtsCheck {
  id: string;
  label: string;
  status: AtsCheckStatus;
  detail: string;
  /** Relative weight in the overall ATS score (0–100, summed across checks). */
  weight: number;
}

export interface AtsKeywordCoverage {
  /** Required keywords found in the CV text. */
  matched: string[];
  /** Required keywords NOT found in the CV text. */
  missing: string[];
  /** Percentage of required keywords present (0–100). */
  coverage: number;
}

export type AtsRating = "excellent" | "good" | "fair" | "poor";

export interface AtsReport {
  /** Overall ATS-friendliness score (0–100). */
  atsScore: number;
  rating: AtsRating;
  /** Whether a usable text layer could be extracted (false = scanned/image CV). */
  parseable: boolean;
  wordCount: number;
  pageCount: number;
  fileType: ExtractFileType;
  checks: AtsCheck[];
  recommendations: string[];
  /** Present only when required job keywords were supplied. */
  keywordCoverage?: AtsKeywordCoverage;
  analyzedAt: string;
}

export type ExtractFileType = "pdf" | "docx" | "image" | "unknown";

export interface ExtractResult {
  text: string;
  pageCount: number;
  fileType: ExtractFileType;
}

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Extract the plain text layer from a CV buffer the same way an ATS would.
 * Images (and unknown types) return empty text on purpose — that is the signal
 * an ATS cannot read them.
 */
export async function extractResumeText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractResult> {
  const mt = (mimeType || "").toLowerCase();

  if (mt === PDF_MIME || mt.endsWith("/pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const res = await parser.getText();
      return {
        text: (res.text ?? "").trim(),
        pageCount: res.total ?? res.pages?.length ?? 0,
        fileType: "pdf",
      };
    } finally {
      await parser.destroy().catch((err) => logger.warn({ err }, "Failed to destroy PDF parser (cleanup)"));
    }
  }

  if (mt === DOCX_MIME || mt.includes("wordprocessingml")) {
    const res = await mammoth.extractRawText({ buffer });
    return { text: (res.value ?? "").trim(), pageCount: 0, fileType: "docx" };
  }

  if (mt.startsWith("image/")) {
    return { text: "", pageCount: 1, fileType: "image" };
  }

  return { text: "", pageCount: 0, fileType: "unknown" };
}

// ─── Heuristic helpers ────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;

/** Standard résumé section headings grouped by category (lower-cased). */
const HEADING_CATEGORIES: Record<string, string[]> = {
  experience: ["experience", "employment", "work history", "professional background", "career history"],
  education: ["education", "academic", "qualifications"],
  skills: ["skills", "competencies", "technical skills", "core competencies", "expertise"],
  summary: ["summary", "objective", "profile", "about me", "professional summary"],
  projects: ["projects", "portfolio"],
  certifications: ["certification", "certifications", "certificate", "licenses", "licences"],
  achievements: ["achievements", "accomplishments", "awards", "honors", "honours"],
  languages: ["languages"],
};

function countDigits(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= "0" && ch <= "9") n++;
  return n;
}

function hasPhone(text: string): boolean {
  // Look for a contiguous run that looks like a phone number (>= 9 digits).
  const candidates = text.match(/[+(]?\d[\d\s().\-]{7,}\d/g) ?? [];
  return candidates.some((c) => countDigits(c) >= 9 && countDigits(c) <= 15);
}

function detectHeadings(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [category, synonyms] of Object.entries(HEADING_CATEGORIES)) {
    if (synonyms.some((syn) => new RegExp(`(^|\\n|\\r)\\s*${escapeRe(syn)}\\b`, "i").test(lower) || lower.includes(syn))) {
      found.push(category);
    }
  }
  return found;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Detects column / table layout artifacts that break ATS parsing. */
function looksColumnarOrTabular(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 8) return false;
  const suspicious = lines.filter(
    (l) => /\S {3,}\S/.test(l) || /\t/.test(l),
  ).length;
  return suspicious / lines.length > 0.18;
}

function encodingNoiseRatio(text: string): number {
  if (!text.length) return 0;
  const bad = (text.match(/[\uFFFD\u0000-\u0008\u000E-\u001F]/g) ?? []).length;
  return bad / text.length;
}

function ratingFor(score: number): AtsRating {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

// ─── Keyword coverage (job-specific relevance) ───────────────────────────────

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
}

export function computeKeywordCoverage(
  text: string,
  requiredKeywords: string[],
): AtsKeywordCoverage {
  const haystack = ` ${normalizeToken(text)} `;
  const matched: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const raw of requiredKeywords) {
    const kw = normalizeToken(raw);
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    if (haystack.includes(` ${kw} `) || haystack.includes(kw)) {
      matched.push(raw);
    } else {
      missing.push(raw);
    }
  }

  const total = matched.length + missing.length;
  const coverage = total === 0 ? 0 : Math.round((matched.length / total) * 100);
  return { matched, missing, coverage };
}

// ─── Core analyzer ────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Required skills/keywords from the job, for an optional coverage report. */
  requiredKeywords?: string[];
}

/**
 * Run the deterministic ATS analysis over already-extracted CV text.
 * Kept separate from extraction so it is trivially unit-testable.
 */
export function analyzeResumeText(
  extract: ExtractResult,
  opts: AnalyzeOptions = {},
): AtsReport {
  const { text, fileType, pageCount } = extract;
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const parseable = wordCount >= 30;

  const checks: AtsCheck[] = [];

  // 1. Machine-readable text layer (the #1 ATS factor).
  checks.push({
    id: "machine_readable",
    label: "Machine-readable text",
    weight: 32,
    ...(wordCount >= 80
      ? { status: "pass" as const, detail: "A clean text layer was extracted — an ATS can read this CV." }
      : wordCount >= 30
        ? { status: "warn" as const, detail: "Only a little text could be extracted. Parts of the CV may be images." }
        : {
            status: "fail" as const,
            detail:
              fileType === "image"
                ? "This is an image file. ATS software cannot read text from images."
                : "Almost no text could be extracted — this looks like a scanned / image-only CV.",
          }),
  });

  // 2. File format.
  checks.push({
    id: "file_format",
    label: "ATS-friendly file format",
    weight: 10,
    ...(fileType === "pdf" || fileType === "docx"
      ? { status: "pass" as const, detail: `${fileType.toUpperCase()} is a standard, ATS-friendly format.` }
      : fileType === "image"
        ? { status: "fail" as const, detail: "Image files (JPG/PNG) are not ATS-friendly. Use a PDF or DOCX." }
        : { status: "warn" as const, detail: "Unrecognized format. Prefer a text-based PDF or DOCX." }),
  });

  // 3. Word count / length.
  checks.push({
    id: "word_count",
    label: "Appropriate length",
    weight: 10,
    ...(wordCount >= 250 && wordCount <= 1200
      ? { status: "pass" as const, detail: `${wordCount} words — a healthy length for ATS parsing.` }
      : wordCount >= 120 && wordCount <= 1800
        ? { status: "warn" as const, detail: `${wordCount} words — a little ${wordCount < 250 ? "short" : "long"}.` }
        : {
            status: "fail" as const,
            detail:
              wordCount < 120
                ? `${wordCount} words — too short; the CV may be missing extractable content.`
                : `${wordCount} words — very long; trim to keep parsing reliable.`,
          }),
  });

  // 4. Contact details.
  const hasEmail = EMAIL_RE.test(text);
  const phone = hasPhone(text);
  checks.push({
    id: "contact_info",
    label: "Contact details present",
    weight: 12,
    ...(hasEmail && phone
      ? { status: "pass" as const, detail: "Email and phone number were detected." }
      : hasEmail || phone
        ? { status: "warn" as const, detail: `Only ${hasEmail ? "an email" : "a phone number"} was detected.` }
        : { status: "fail" as const, detail: "No email or phone number could be parsed from the CV." }),
  });

  // 5. Standard section headings.
  const headings = detectHeadings(text);
  checks.push({
    id: "standard_headings",
    label: "Standard section headings",
    weight: 16,
    ...(headings.length >= 4
      ? { status: "pass" as const, detail: `Found standard sections: ${headings.join(", ")}.` }
      : headings.length >= 2
        ? { status: "warn" as const, detail: `Only found: ${headings.join(", ") || "none"}. Add clear sections like Experience, Education, Skills.` }
        : { status: "fail" as const, detail: "Few/no standard headings found. ATS relies on sections like Experience, Education, Skills." }),
  });

  // 6. Parseable dates (employment timeline).
  const years = (text.match(YEAR_RE) ?? []).length;
  checks.push({
    id: "dates",
    label: "Dated work history",
    weight: 6,
    ...(years >= 2
      ? { status: "pass" as const, detail: "Year/date markers were found for the work history." }
      : years === 1
        ? { status: "warn" as const, detail: "Only one date marker found — add start/end dates to each role." }
        : { status: "fail" as const, detail: "No date markers found — add years to your experience and education." }),
  });

  // 7. Simple single-column layout (tables/columns break ATS parsing).
  const columnar = looksColumnarOrTabular(text);
  checks.push({
    id: "layout_simple",
    label: "Single-column layout",
    weight: 10,
    ...(parseable && !columnar
      ? { status: "pass" as const, detail: "No multi-column or table artifacts detected." }
      : columnar
        ? { status: "warn" as const, detail: "Possible multi-column or table layout — these often scramble in ATS parsing." }
        : { status: "warn" as const, detail: "Could not confirm a simple layout due to limited text." }),
  });

  // 8. Clean character encoding.
  const noise = encodingNoiseRatio(text);
  checks.push({
    id: "encoding_clean",
    label: "Clean text encoding",
    weight: 4,
    ...(noise < 0.005
      ? { status: "pass" as const, detail: "No broken characters detected." }
      : { status: "warn" as const, detail: "Some characters did not decode cleanly — check for unusual fonts or symbols." }),
  });

  // ── Weighted score ──────────────────────────────────────────────────────────
  const statusValue: Record<AtsCheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  let score = Math.round(
    (checks.reduce((sum, c) => sum + c.weight * statusValue[c.status], 0) / totalWeight) * 100,
  );

  // Gating: a non-parseable CV is fundamentally ATS-hostile regardless of any
  // inferred signals — cap the score hard.
  if (!parseable) score = Math.min(score, 25);

  // ── Recommendations ─────────────────────────────────────────────────────────
  const recommendations: string[] = [];
  for (const c of checks) {
    if (c.status === "fail") recommendations.push(fixFor(c.id, "fail"));
    else if (c.status === "warn") recommendations.push(fixFor(c.id, "warn"));
  }

  const report: AtsReport = {
    atsScore: score,
    rating: ratingFor(score),
    parseable,
    wordCount,
    pageCount,
    fileType,
    checks,
    recommendations: recommendations.filter(Boolean),
    analyzedAt: new Date().toISOString(),
  };

  if (opts.requiredKeywords && opts.requiredKeywords.length > 0) {
    report.keywordCoverage = computeKeywordCoverage(text, opts.requiredKeywords);
  }

  return report;
}

function fixFor(checkId: string, status: AtsCheckStatus): string {
  const map: Record<string, string> = {
    machine_readable:
      status === "fail"
        ? "Export the CV as a text-based PDF (not a scan/photo) so an ATS can read it."
        : "Make sure the whole CV is selectable text, not an embedded image.",
    file_format: "Save and upload the CV as a PDF or DOCX instead of an image.",
    word_count:
      status === "fail"
        ? "Adjust the CV length — aim for roughly 300–900 words of real content."
        : "Aim for roughly 300–900 words of focused content.",
    contact_info: "Add a clear email address and phone number as plain text near the top.",
    standard_headings: "Use standard section titles: Summary, Experience, Education, Skills.",
    dates: "Add start and end dates (e.g. Jan 2021 – Present) to every role and degree.",
    layout_simple: "Use a single-column layout — avoid tables, text boxes and multiple columns.",
    encoding_clean: "Stick to standard fonts and avoid decorative symbols/icons for key text.",
  };
  return map[checkId] ?? "";
}

/**
 * Convenience: extract text from a buffer and analyze it in one call.
 */
export async function analyzeCvBuffer(
  buffer: Buffer,
  mimeType: string,
  opts: AnalyzeOptions = {},
): Promise<AtsReport> {
  const extract = await extractResumeText(buffer, mimeType);
  return analyzeResumeText(extract, opts);
}
